package org.example.pet_social.dto;

import org.example.pet_social.entity.Pet;
import org.example.pet_social.entity.PetMatch;

/**
 * A walk/blind-date request thread header. `myPet`/`otherPet` are oriented to
 * the requesting user (viewerUserId) so the app never has to figure out sides;
 * `direction` is "outgoing" when the viewer initiated it.
 */
public record MatchResponse(
        String id,
        String matchType,
        String status,
        String direction,
        PetSummary myPet,
        PetSummary otherPet,
        Long otherOwnerId,
        String otherOwnerName,
        String notes,
        String meetingDate,
        String meetingTime,
        String time
) {
    public record PetSummary(String id, String name, String emoji, String breed) {
        static PetSummary from(Pet pet) {
            return new PetSummary(String.valueOf(pet.getId()), pet.getName(), UiFormat.petEmoji(pet), pet.getBreed());
        }
    }

    public static MatchResponse from(PetMatch match, Long viewerUserId) {
        boolean viewerOwnsPet1 = match.getPet1().getOwner().getId().equals(viewerUserId);
        Pet mine = viewerOwnsPet1 ? match.getPet1() : match.getPet2();
        Pet other = viewerOwnsPet1 ? match.getPet2() : match.getPet1();
        boolean outgoing = viewerUserId.equals(match.getInitiatedByUserId());
        return new MatchResponse(
                String.valueOf(match.getId()),
                match.getMatchType() == null ? "" : match.getMatchType().toLowerCase(),
                match.getMatchStatus() == null ? "" : match.getMatchStatus().toLowerCase(),
                outgoing ? "outgoing" : "incoming",
                PetSummary.from(mine),
                PetSummary.from(other),
                other.getOwner().getId(),
                other.getOwner().getName(),
                match.getNotes(),
                UiFormat.invitationDate(match.getMeetingDate()),
                UiFormat.invitationTime(match.getMeetingDate()),
                UiFormat.relativeTime(match.getCreatedAt())
        );
    }
}
