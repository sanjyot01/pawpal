# Multi-node AWS deployment (Phase 1)

The 2-node + 1-witness topology from the project proposal, replacing the
single-instance `docker-compose.aws.yml` where app, Postgres, Kafka and Redis all
shared one box (and one blast radius).

## Layout

```
                       internet
                          |
                   ALB (public subnet)      <-- the only thing with a public address
                    /              \
        ┌──────────────────┐  ┌──────────────────┐      ┌─────────────┐
        │ NODE A (private) │  │ NODE B (private) │      │  WITNESS    │
        │  app             │  │  app             │      │  sentinel   │
        │  kafka broker    │  │  redis PRIMARY   │      │  (quorum,   │
        │  redis replica   │  │  sentinel        │      │   no data)  │
        │  sentinel        │  │                  │      │  t3.nano    │
        └──────────────────┘  └──────────────────┘      └─────────────┘
                    \              /
                     RDS PostgreSQL (private, Multi-AZ optional)
```

**Why this placement.** The Kafka broker and the Redis primary are the two
I/O-hottest processes; putting them on the same instance makes each the other's
noisy neighbour on disk and network, which is the same reasoning that moves
Postgres to its own RDS endpoint. The witness carries no workload at all — it
exists so Sentinel has an odd number of votes and a partition can't produce two
primaries.

**What this does not fix.** Kafka is still a single broker at replication factor
1, so losing node A stops telemetry ingestion until it comes back. And all writes
still funnel into one Redis primary — replicas are failover, not write capacity.
Both are Phase 2 items (MSK; sharding `users:geo` by city tile). See
`../SCALABILITY_REVIEW_2026-08-09.md` §1.5.

**Where this differs from the design sketch.** The written Phase 1 says "node A: app +
Kafka, node B: app + Redis primary". These files also put a **Redis replica on node A**
and a **Sentinel on all three** — without a replica there is nothing to fail over *to*,
so the witness would arbitrate an election with no candidate. The placement rule the
sketch actually cares about is preserved: the Kafka broker and the Redis *primary* never
share a box.

**Time to stand this up: a few hours, not minutes** — RDS provisioning alone is ~10
minutes, and the first in-container Maven build is another 5–10 per node. If you are
against a deadline, deploy the single-instance `../docker-compose.aws.yml` and present
this topology as the design; that is a defensible split, and it is the one the review
recommends when the clock matters.

## Provisioning the AWS side

Everything below assumes `aws` is configured. Substitute your own region/VPC/key; the
examples use `us-east-2` and the account's default VPC.

**Budget reality check first.** The design says app instances and datastores live in
private subnets. True private subnets need a NAT gateway for the instances to pull
Docker images and Maven dependencies, and NAT is ~$32/month — which is more than the
three instances cost. On a capstone budget the honest compromise is public subnets with
security groups that only permit the ALB to reach 8080, and the nodes to reach each
other. That gets the same reachability guarantees; what it gives up is defence in depth
if a security group is later misconfigured. Say that out loud rather than claiming
private subnets you didn't build.

```bash
REGION=us-east-2
VPC=vpc-0de0a557a3217366d
KEY=pawpal
AMI=$(aws ssm get-parameter --name /aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64 \
      --query Parameter.Value --output text)
SUBNETS=$(aws ec2 describe-subnets --filters "Name=vpc-id,Values=$VPC" \
      --query 'Subnets[].SubnetId' --output text)   # ALB needs >=2, in different AZs
```

### Security groups

Three groups, so the rules describe intent rather than a flat allow-list:

```bash
ALB_SG=$(aws ec2 create-security-group --group-name pawpal-alb  --description "public ALB"  --vpc-id $VPC --query GroupId --output text)
APP_SG=$(aws ec2 create-security-group --group-name pawpal-app  --description "app nodes"   --vpc-id $VPC --query GroupId --output text)
DATA_SG=$(aws ec2 create-security-group --group-name pawpal-data --description "rds"        --vpc-id $VPC --query GroupId --output text)

# internet -> ALB only
aws ec2 authorize-security-group-ingress --group-id $ALB_SG --protocol tcp --port 80 --cidr 0.0.0.0/0
# ALB -> app instances (8080 is never open to the internet)
aws ec2 authorize-security-group-ingress --group-id $APP_SG --protocol tcp --port 8080 --source-group $ALB_SG
# nodes talk to each other: Redis replication, Sentinel gossip, Kafka
aws ec2 authorize-security-group-ingress --group-id $APP_SG --protocol tcp --port 6379  --source-group $APP_SG
aws ec2 authorize-security-group-ingress --group-id $APP_SG --protocol tcp --port 26379 --source-group $APP_SG
aws ec2 authorize-security-group-ingress --group-id $APP_SG --protocol tcp --port 9092  --source-group $APP_SG
# your laptop -> SSH
aws ec2 authorize-security-group-ingress --group-id $APP_SG --protocol tcp --port 22 --cidr $(curl -s https://checkip.amazonaws.com)/32
# app nodes -> RDS
aws ec2 authorize-security-group-ingress --group-id $DATA_SG --protocol tcp --port 5432 --source-group $APP_SG
```

### RDS (Postgres)

```bash
aws rds create-db-instance --db-instance-identifier pawpal \
  --db-instance-class db.t4g.micro --engine postgres --engine-version 16 \
  --allocated-storage 20 --master-username pawpal --master-user-password "$DB_PASSWORD" \
  --db-name pet_social_db --vpc-security-group-ids $DATA_SG --no-publicly-accessible \
  --backup-retention-period 7
aws rds wait db-instance-available --db-instance-identifier pawpal
aws rds describe-db-instances --db-instance-identifier pawpal \
  --query 'DBInstances[0].Endpoint.Address' --output text   # -> RDS_ENDPOINT
```

### The three instances

**Sizing matters here.** The Dockerfile pins the app to `-Xmx2g`, and node A also runs a
Kafka JVM and a Redis replica. On a 4 GB `t3.medium` that OOMs — either use `t3.large`,
or keep `t3.medium` and override `JAVA_OPTS` to `-Xmx1g` in the compose file. Give each
node a 30 GB root volume: the default 8 GB fills during the in-container Maven build.

```bash
run_node () {  # $1=Name $2=type
  aws ec2 run-instances --image-id $AMI --instance-type $2 --key-name $KEY \
    --security-group-ids $APP_SG \
    --block-device-mappings '[{"DeviceName":"/dev/xvda","Ebs":{"VolumeSize":30,"VolumeType":"gp3"}}]' \
    --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=$1}]" \
    --query 'Instances[0].InstanceId' --output text
}
run_node pawpal-node-a t3.large
run_node pawpal-node-b t3.large
run_node pawpal-witness t3.nano     # quorum only, carries no workload
```

Collect the **private** IPs (that is what `.env` wants — the nodes talk over the VPC):

```bash
aws ec2 describe-instances --filters "Name=tag:Name,Values=pawpal-*" "Name=instance-state-name,Values=running" \
  --query 'Reservations[].Instances[].[Tags[?Key==`Name`]|[0].Value,PrivateIpAddress,PublicIpAddress]' --output text
```

### ALB in front of the two app nodes

```bash
ALB_ARN=$(aws elbv2 create-load-balancer --name pawpal-alb --subnets $SUBNETS \
  --security-groups $ALB_SG --query 'LoadBalancers[0].LoadBalancerArn' --output text)
TG_ARN=$(aws elbv2 create-target-group --name pawpal-tg --protocol HTTP --port 8080 --vpc-id $VPC \
  --health-check-path /api/system/health --health-check-interval-seconds 15 \
  --query 'TargetGroups[0].TargetGroupArn' --output text)
aws elbv2 register-targets --target-group-arn $TG_ARN --targets Id=<NODE_A_ID> Id=<NODE_B_ID>
aws elbv2 create-listener --load-balancer-arn $ALB_ARN --protocol HTTP --port 80 \
  --default-actions Type=forward,TargetGroupArn=$TG_ARN
aws elbv2 describe-load-balancers --load-balancer-arns $ALB_ARN --query 'LoadBalancers[0].DNSName' --output text
```

The health check is why this works without session affinity: auth is stateless, so the
ALB can send any request to either node. `/api/system/health` is deliberately in the
JWT filter's public allowlist — the ALB cannot present a bearer token.

### Secrets

`.env` on each box is fine to start, but put the two that matter in SSM and render them
at boot rather than leaving them on disk:

```bash
aws ssm put-parameter --name /pawpal/jwt-secret --type SecureString --value "$(openssl rand -base64 48)"
aws ssm put-parameter --name /pawpal/db-password --type SecureString --value "$DB_PASSWORD"
```

Instances need an IAM role with `ssm:GetParameter` to read them.

## Bring-up order

Node B first — node A's replica needs a primary to attach to, and Sentinel needs
the primary reachable to start monitoring.

```bash
# 1. every instance
cp .env.example .env && vi .env          # same values on all three

# 2. NODE B
docker compose --env-file .env -f docker-compose.node-b.yml up -d

# 3. NODE A  (runs Flyway migrations; node B has FLYWAY_ENABLED=false so the
#             two instances can't race for the migration lock at startup)
docker compose --env-file .env -f docker-compose.node-a.yml up -d

# 4. WITNESS
docker compose --env-file .env -f docker-compose.witness.yml up -d
```

## Verify

```bash
# replication is live (expect role:master + connected_slaves:1)
redis-cli -h $NODE_B_IP info replication

# all three sentinels see each other (expect num-other-sentinels:2)
redis-cli -h $WITNESS_IP -p 26379 sentinel master pawpal | grep -E 'num-other-sentinels|quorum'

# both app instances healthy
curl -s http://$NODE_A_IP:8080/api/system/health
curl -s http://$NODE_B_IP:8080/api/system/health

# schema is at the expected migration version
psql -h $RDS_ENDPOINT -U $DB_USERNAME -d pet_social_db \
  -c 'select version, description, success from flyway_schema_history order by installed_rank'
```

Failover drill — stop the primary and confirm a replica is promoted within
`down-after-milliseconds` + `failover-timeout` (~15s here), with no app redeploy:

```bash
docker stop pawpal-redis-primary
sleep 20
redis-cli -h $NODE_A_IP info replication | grep role   # expect role:master
```

## Security groups

| From | To | Port | Why |
|---|---|---|---|
| internet | ALB | 443 | only public ingress |
| ALB | node A, node B | 8080 | app traffic; never open 8080 to the internet |
| node A ↔ node B | each other | 6379 | Redis replication |
| node A, node B, witness | each other | 26379 | Sentinel gossip |
| node B | node A | 9092 | Kafka clients |
| node A, node B | RDS | 5432 | JDBC |

The app instances need **no** inbound rule from the internet, and the witness
needs none from the ALB. Egress to the Expo push endpoint (443) is required on
both app nodes, or notifications silently fail to deliver.

## Secrets

`.env` is gitignored, but a file on disk is not a secret store. Put
`DB_PASSWORD` and `APP_JWT_SECRET` in SSM Parameter Store (free tier) and render
`.env` at boot:

```bash
aws ssm get-parameter --name /pawpal/jwt-secret --with-decryption \
  --query Parameter.Value --output text
```

The single-instance `docker-compose.aws.yml` still carries a hardcoded JWT secret.
Rotate it when moving here — anything that was committed should be treated as
compromised.
