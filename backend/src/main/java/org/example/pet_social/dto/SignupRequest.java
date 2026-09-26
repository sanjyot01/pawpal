package org.example.pet_social.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

public class SignupRequest {

    @NotBlank(message = "Name is required")
    private String name;

    @NotBlank(message = "Email is required")
    @Email(message = "Email should be valid")
    private String email;

    @NotBlank(message = "Password is required")
    private String password;

    @NotBlank(message = "Role is required")
    @Pattern(
            regexp = "PET_OWNER|PET_SITTER|VET|BUSINESS",
            message = "Role must be one of: PET_OWNER, PET_SITTER, VET, BUSINESS"
    )
    private String role;

    private boolean active = true;

    private Long matchPreferencesMask = 0L;

    public SignupRequest() {
    }

    public SignupRequest(String name, String email, String password, String role, boolean active) {
        this.name = name;
        this.email = email;
        this.password = password;
        this.role = role;
        this.active = active;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getEmail() {
        return email;
    }

    public void setEmail(String email) {
        this.email = email;
    }

    public String getPassword() {
        return password;
    }

    public void setPassword(String password) {
        this.password = password;
    }

    public String getRole() {
        return role;
    }

    public void setRole(String role) {
        this.role = role;
    }

    public boolean isActive() {
        return active;
    }

    public void setActive(boolean active) {
        this.active = active;
    }

    public Long getMatchPreferencesMask() {
        return matchPreferencesMask;
    }

    public void setMatchPreferencesMask(Long matchPreferencesMask) {
        this.matchPreferencesMask = matchPreferencesMask;
    }
}