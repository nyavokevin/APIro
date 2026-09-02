package main

import "github.com/gin-gonic/gin"

func getUser(c *gin.Context) {}
func createUser(c *gin.Context) {}
func health(c *gin.Context) {}

func main() {
    r := gin.Default()
    api := r.Group("/api/v1")
    {
        api.GET("/users/:id", getUser)
        api.POST("/users", createUser)
        r.GET("/health", health)
    }
}
