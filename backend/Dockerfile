# ==========================================
# STAGE 1: Build (Heavy dependency layer)
# ==========================================
FROM maven:3.9.9-eclipse-temurin-21 AS builder
WORKDIR /app

# Copy pom.xml first to cache Maven dependencies
# This makes subsequent Docker builds extremely fast
COPY pom.xml .
RUN mvn dependency:go-offline -B

# Copy the actual source code and compile the JAR
# We skip tests here because testing happens in the CI/CD pipeline, not during image creation
COPY src ./src
RUN mvn clean package -DskipTests

# ==========================================
# STAGE 2: Runtime (Lightweight execution layer)
# ==========================================
FROM eclipse-temurin:21-jre-jammy
WORKDIR /app

# SECURITY: Run as a non-root user.
# Running containers as root is an instant red flag in enterprise security reviews.
RUN addgroup --system spring && adduser --system --ingroup spring spring
USER spring:spring

# Copy ONLY the compiled JAR from Stage 1, leaving all the heavy Maven source files behind
COPY --from=builder /app/target/*.jar app.jar

# Expose standard Spring Boot port
EXPOSE 8080

# PERFORMANCE TUNING: The Engine's Lifeline
# 1. -XX:+UseZGC: The Z Garbage Collector. It guarantees sub-millisecond pause times,
#                 crucial for your P99 latency metrics under heavy telemetry load.
# 2. -Xms1g -Xmx2g: Hard-caps the heap memory. This prevents the JVM from infinitely
#                   consuming RAM and triggering the Linux Out-Of-Memory (OOM) killer.
# 3. -XX:+HeapDumpOnOutOfMemoryError: If it does crash under 50k load, this saves the evidence.
ENV JAVA_OPTS="-XX:+UseZGC -Xms1g -Xmx2g -XX:+HeapDumpOnOutOfMemoryError -XX:MaxMetaspaceSize=256m"

# Execute the application
ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS -jar app.jar"]