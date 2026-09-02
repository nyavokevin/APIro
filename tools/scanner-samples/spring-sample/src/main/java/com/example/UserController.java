package com.example;

import org.springframework.web.bind.annotation.*;
import org.springframework.http.ResponseEntity;

@RestController
@RequestMapping("/api/v1/users")
public class UserController {

    /**
     * List all users
     */
    @GetMapping
    public ResponseEntity<List<User>> list(@RequestParam String role) {
        return null;
    }

    @GetMapping("/{id}")
    public ResponseEntity<User> getUser(@PathVariable String id) {
        return null;
    }

    @PostMapping
    public ResponseEntity<User> create(@RequestBody User body) {
        return null;
    }

    @PutMapping("/{id}")
    public ResponseEntity<User> update(@PathVariable String id, @RequestBody User body) {
        return null;
    }
}
