import time
import uuid
import random
from datetime import datetime, timedelta
from typing import Optional, List

import strawberry
from strawberry.types import Info
from graphql import GraphQLError

from .db import users_db, products_db, orders_db, tokens_db, generate_fake_user, generate_fake_product, START_TIME


# ── Object types ──────────────────────────────────────────────

@strawberry.type
class User:
    id: strawberry.ID
    name: str
    email: str
    role: str
    avatar: Optional[str] = None
    createdAt: Optional[str] = None


@strawberry.type
class Product:
    id: strawberry.ID
    name: str
    price: float
    category: str
    stock: int
    rating: Optional[float] = None
    description: Optional[str] = None
    inStock: bool


@strawberry.type
class Order:
    id: strawberry.ID
    userId: strawberry.ID
    products: List[strawberry.ID]
    total: float
    status: str
    createdAt: Optional[str] = None


@strawberry.type
class PageInfo:
    page: int
    limit: int
    total: int
    pages: int


@strawberry.type
class UserPage:
    data: List[User]
    pagination: PageInfo


@strawberry.type
class ProductPage:
    data: List[Product]
    pagination: PageInfo


@strawberry.type
class OrderPage:
    data: List[Order]
    pagination: PageInfo


@strawberry.type
class AuthPayload:
    token: str
    refreshToken: str
    expiresIn: int
    tokenType: str


@strawberry.type
class Health:
    status: str
    timestamp: str
    version: str


@strawberry.type
class SystemStatus:
    status: str
    uptimeSeconds: int
    usersCount: int
    productsCount: int
    ordersCount: int
    timestamp: str


# ── Inputs ────────────────────────────────────────────────────

@strawberry.input
class UserInput:
    name: str
    email: str
    role: Optional[str] = "user"


@strawberry.input
class UserUpdateInput:
    name: Optional[str] = None
    email: Optional[str] = None
    role: Optional[str] = None


@strawberry.input
class ProductInput:
    name: str
    price: float
    category: str
    stock: Optional[int] = 0
    description: Optional[str] = ""
    inStock: Optional[bool] = True


# ── Helpers ───────────────────────────────────────────────────

def _to_user(d: dict) -> User:
    return User(
        id=d["id"], name=d["name"], email=d["email"], role=d["role"],
        avatar=d.get("avatar"), createdAt=d.get("createdAt") or d.get("created_at"),
    )

def _to_product(d: dict) -> Product:
    return Product(
        id=d["id"], name=d["name"], price=d["price"], category=d["category"],
        stock=d["stock"], rating=d.get("rating"), description=d.get("description"),
        inStock=d.get("inStock", True),
    )

def _to_order(d: dict) -> Order:
    return Order(
        id=d["id"], userId=d["userId"] if "userId" in d else d.get("user_id", ""),
        products=d["products"], total=d["total"], status=d["status"],
        createdAt=d.get("createdAt") or d.get("created_at"),
    )

def _require_auth(info: Info) -> str:
    req = info.context.get("request") if isinstance(info.context, dict) else None
    # strawberry fastapi passes {"request": Request, "background_tasks": ...}
    if req is None and hasattr(info.context, "headers"):
        req = info.context
    auth = None
    if isinstance(info.context, dict) and "request" in info.context:
        auth = info.context["request"].headers.get("authorization") or info.context["request"].headers.get("Authorization")
    if not auth:
        raise GraphQLError("Missing Authorization header", extensions={"code": "UNAUTHENTICATED"})
    if not auth.startswith("Bearer "):
        raise GraphQLError("Missing Bearer token", extensions={"code": "UNAUTHENTICATED"})
    token = auth.replace("Bearer ", "").strip()
    if token not in tokens_db:
        raise GraphQLError("Invalid or expired token", extensions={"code": "UNAUTHENTICATED"})
    return token


# ── Query ─────────────────────────────────────────────────────

@strawberry.type
class Query:
    @strawberry.field
    def health(self) -> Health:
        return Health(status="ok", timestamp=datetime.now().isoformat(), version="1.0.0")

    @strawberry.field
    def status(self) -> SystemStatus:
        uptime = int(time.time() - START_TIME.timestamp())
        return SystemStatus(
            status="healthy", uptimeSeconds=uptime,
            usersCount=len(users_db), productsCount=len(products_db), ordersCount=len(orders_db),
            timestamp=datetime.now().isoformat(),
        )

    @strawberry.field
    def me(self, info: Info) -> User:
        token = _require_auth(info)
        email = tokens_db[token]["email"]
        return User(
            id=str(uuid.uuid4()), name=email.split("@")[0].title(),
            email=email, role="admin",
            avatar=f"https://i.pravatar.cc/150?u={token[:8]}",
            createdAt=datetime.now().isoformat(),
        )

    @strawberry.field
    def users(self, page: int = 1, limit: int = 10, role: Optional[str] = None, search: Optional[str] = None) -> UserPage:
        all_users = list(users_db.values())
        if role:
            all_users = [u for u in all_users if u["role"] == role]
        if search:
            s = search.lower()
            all_users = [u for u in all_users if s in u["name"].lower() or s in u["email"].lower()]
        total = len(all_users)
        pages = (total + limit - 1) // limit if limit else 1
        start = (page - 1) * limit
        slice_ = all_users[start:start+limit]
        return UserPage(data=[_to_user(u) for u in slice_], pagination=PageInfo(page=page, limit=limit, total=total, pages=pages))

    @strawberry.field
    def user(self, id: strawberry.ID) -> Optional[User]:
        d = users_db.get(str(id))
        if not d:
            raise GraphQLError("User not found", extensions={"code": "NOT_FOUND"})
        return _to_user(d)

    @strawberry.field
    def products(self, page: int = 1, limit: int = 10, category: Optional[str] = None, minPrice: Optional[float] = None, maxPrice: Optional[float] = None, inStock: Optional[bool] = None) -> ProductPage:
        all_products = list(products_db.values())
        if category:
            all_products = [p for p in all_products if p["category"].lower() == category.lower()]
        if minPrice is not None:
            all_products = [p for p in all_products if p["price"] >= minPrice]
        if maxPrice is not None:
            all_products = [p for p in all_products if p["price"] <= maxPrice]
        if inStock is not None:
            all_products = [p for p in all_products if p["inStock"] == inStock]
        total = len(all_products)
        pages = (total + limit - 1) // limit if limit else 1
        start = (page - 1) * limit
        slice_ = all_products[start:start+limit]
        return ProductPage(data=[_to_product(p) for p in slice_], pagination=PageInfo(page=page, limit=limit, total=total, pages=pages))

    @strawberry.field
    def product(self, id: strawberry.ID) -> Optional[Product]:
        d = products_db.get(str(id))
        if not d:
            raise GraphQLError("Product not found", extensions={"code": "NOT_FOUND"})
        return _to_product(d)

    @strawberry.field
    def orders(self, page: int = 1, limit: int = 10, status: Optional[str] = None) -> OrderPage:
        all_orders = list(orders_db.values())
        if status:
            all_orders = [o for o in all_orders if o["status"] == status]
        total = len(all_orders)
        pages = (total + limit - 1) // limit if limit else 1
        start = (page - 1) * limit
        slice_ = all_orders[start:start+limit]
        return OrderPage(data=[_to_order(o) for o in slice_], pagination=PageInfo(page=page, limit=limit, total=total, pages=pages))

    @strawberry.field
    def order(self, id: strawberry.ID) -> Optional[Order]:
        d = orders_db.get(str(id))
        if not d:
            raise GraphQLError("Order not found", extensions={"code": "NOT_FOUND"})
        return _to_order(d)

    @strawberry.field
    def seedUser(self) -> strawberry.scalars.JSON:
        return generate_fake_user()

    @strawberry.field
    def seedProduct(self) -> strawberry.scalars.JSON:
        return generate_fake_product()

    @strawberry.field
    def slow(self, delay: int = 2) -> strawberry.scalars.JSON:
        if delay < 0 or delay > 30:
            raise GraphQLError("delay must be 0..30", extensions={"code": "BAD_USER_INPUT"})
        time.sleep(delay)
        return {"message": f"Response after {delay} seconds", "timestamp": datetime.now().isoformat()}

    @strawberry.field
    def echo(self, message: str) -> str:
        return f"Echo: {message}"

    @strawberry.field
    def errorTest(self, code: int) -> Optional[str]:
        if code == 400:
            raise GraphQLError("Bad Request -- malformed input", extensions={"code": "BAD_USER_INPUT"})
        elif code == 401:
            raise GraphQLError("Unauthorized -- invalid token", extensions={"code": "UNAUTHENTICATED"})
        elif code == 403:
            raise GraphQLError("Forbidden -- insufficient permissions", extensions={"code": "FORBIDDEN"})
        elif code == 404:
            raise GraphQLError("Not Found -- resource does not exist", extensions={"code": "NOT_FOUND"})
        elif code == 500:
            raise GraphQLError("Internal Server Error -- something went wrong", extensions={"code": "INTERNAL_SERVER_ERROR"})
        return f"Status {code} -- custom response"


# ── Mutation ──────────────────────────────────────────────────

@strawberry.type
class Mutation:
    @strawberry.mutation
    def login(self, email: str, password: str) -> AuthPayload:
        if "@" not in email:
            raise GraphQLError("Invalid email format", extensions={"code": "BAD_USER_INPUT"})
        token = f"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.{uuid.uuid4().hex}.{uuid.uuid4().hex}"
        refresh = f"refresh_{uuid.uuid4().hex}"
        tokens_db[token] = {"email": email, "created": datetime.now().isoformat(), "expires": (datetime.now() + timedelta(hours=1)).isoformat()}
        return AuthPayload(token=token, refreshToken=refresh, expiresIn=3600, tokenType="Bearer")

    @strawberry.mutation
    def refreshToken(self, refreshToken: str) -> AuthPayload:
        if not refreshToken.startswith("refresh_"):
            raise GraphQLError("Invalid refresh token", extensions={"code": "UNAUTHENTICATED"})
        new_token = f"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.{uuid.uuid4().hex}.{uuid.uuid4().hex}"
        return AuthPayload(token=new_token, refreshToken=refreshToken, expiresIn=3600, tokenType="Bearer")

    @strawberry.mutation
    def createUser(self, input: UserInput) -> User:
        if len(input.name) < 2:
            raise GraphQLError("name must be >=2 chars", extensions={"code": "BAD_USER_INPUT"})
        if "@" not in input.email:
            raise GraphQLError("Invalid email", extensions={"code": "BAD_USER_INPUT"})
        if input.role not in ("admin", "user", "editor"):
            raise GraphQLError("role must be admin|user|editor", extensions={"code": "BAD_USER_INPUT"})
        uid = str(uuid.uuid4())
        rec = {"id": uid, "name": input.name, "email": input.email, "role": input.role, "avatar": f"https://i.pravatar.cc/150?u={uid}", "createdAt": datetime.now().isoformat()}
        users_db[uid] = rec
        return _to_user(rec)

    @strawberry.mutation
    def updateUser(self, id: strawberry.ID, input: UserUpdateInput) -> User:
        uid = str(id)
        if uid not in users_db:
            raise GraphQLError("User not found", extensions={"code": "NOT_FOUND"})
        if input.name is not None:
            users_db[uid]["name"] = input.name
        if input.email is not None:
            users_db[uid]["email"] = input.email
        if input.role is not None:
            users_db[uid]["role"] = input.role
        return _to_user(users_db[uid])

    @strawberry.mutation
    def deleteUser(self, id: strawberry.ID) -> str:
        uid = str(id)
        if uid not in users_db:
            raise GraphQLError("User not found", extensions={"code": "NOT_FOUND"})
        del users_db[uid]
        return uid

    @strawberry.mutation
    def createProduct(self, input: ProductInput) -> Product:
        if len(input.name) < 2:
            raise GraphQLError("name must be >=2 chars", extensions={"code": "BAD_USER_INPUT"})
        if input.price <= 0:
            raise GraphQLError("price must be >0", extensions={"code": "BAD_USER_INPUT"})
        pid = f"SKU-{uuid.uuid4().hex[:8].upper()}"
        rec = {
            "id": pid, "name": input.name, "price": input.price, "category": input.category,
            "stock": input.stock or 0, "description": input.description or "",
            "inStock": (input.inStock and (input.stock or 0) > 0) if input.inStock is not None else True,
            "rating": 0.0,
        }
        products_db[pid] = rec
        return _to_product(rec)

    @strawberry.mutation
    def deleteProduct(self, id: strawberry.ID) -> str:
        pid = str(id)
        if pid not in products_db:
            raise GraphQLError("Product not found", extensions={"code": "NOT_FOUND"})
        del products_db[pid]
        return pid

    @strawberry.mutation
    def ping(self, message: Optional[str] = None) -> str:
        return message or "pong"


schema = strawberry.Schema(query=Query, mutation=Mutation)
