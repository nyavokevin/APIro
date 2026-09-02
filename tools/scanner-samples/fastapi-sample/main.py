from fastapi import FastAPI, Depends, Query
from pydantic import BaseModel

app = FastAPI()

class LoginRequest(BaseModel):
    email: str
    password: str

@app.post("/v1/auth/login")
def login(credentials: LoginRequest):
    """Authenticate and receive JWT-like token."""
    pass

@app.get("/v1/users")
def list_users(page: int = Query(1, ge=1), limit: int = Query(10, ge=1)):
    pass

@app.get("/v1/users/{user_id}")
def get_user(user_id: str):
    pass

@app.post("/v1/products")
def create_product(name: str = Query(...)):
    pass
