package org.example.pet_social.dto;

public class AuthResponse {

    private Long id;
    private String name;
    private String email;
    private String role;
    private boolean active;
    private String token;

    public AuthResponse() {
    }

    public AuthResponse(Long id, String name, String email, String role, boolean active) {
        this(id, name, email, role, active, null);
    }

    public AuthResponse(Long id, String name, String email, String role, boolean active, String token) {
        this.id = id;
        this.name = name;
        this.email = email;
        this.role = role;
        this.active = active;
        this.token = token;
    }

    public String getToken() {
        return token;
    }

    public void setToken(String token) {
        this.token = token;
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
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
}