"""
In-memory DB for GraphQL API — mirrors tools/api-test/backend/apiforge_test_backend.py
seed logic so both tools return comparable data.
"""
import uuid
import random
import string
from datetime import datetime, timedelta

users_db: dict[str, dict] = {}
products_db: dict[str, dict] = {}
orders_db: dict[str, dict] = {}
tokens_db: dict[str, dict] = {}
api_keys_db: dict[str, dict] = {
    "dev_key_abc123_local": {"name": "Local Dev", "tier": "free"},
    "staging_key_xyz789": {"name": "Staging", "tier": "pro"},
    "prod_key_secret_001": {"name": "Production", "tier": "enterprise"},
}

START_TIME = datetime.now()


def seed_data():
    users_db.clear()
    products_db.clear()
    orders_db.clear()
    for i in range(1, 21):
        uid = str(uuid.uuid4())
        users_db[uid] = {
            "id": uid,
            "name": f"User {i}",
            "email": f"user{i}@example.com",
            "role": random.choice(["admin", "user", "editor"]),
            "avatar": f"https://i.pravatar.cc/150?u={uid}",
            "createdAt": (datetime.now() - timedelta(days=random.randint(1, 365))).isoformat(),
        }
    categories = ["Electronics", "Books", "Clothing", "Food", "Toys"]
    for i in range(1, 51):
        pid = f"SKU-{uuid.uuid4().hex[:8].upper()}"
        products_db[pid] = {
            "id": pid,
            "name": f"Product {i} -- {random.choice(categories)}",
            "price": round(random.uniform(5.0, 500.0), 2),
            "category": random.choice(categories),
            "stock": random.randint(0, 100),
            "rating": round(random.uniform(1.0, 5.0), 1),
            "description": f"This is a detailed description for product {i}.",
            "inStock": random.randint(0, 100) > 0,
        }
    for i in range(1, 11):
        oid = str(uuid.uuid4())
        user_id = random.choice(list(users_db.keys()))
        product_ids = random.sample(list(products_db.keys()), k=random.randint(1, 5))
        total = sum(products_db[p]["price"] for p in product_ids)
        orders_db[oid] = {
            "id": oid,
            "userId": user_id,
            "products": product_ids,
            "total": round(total, 2),
            "status": random.choice(["pending", "shipped", "delivered", "cancelled"]),
            "createdAt": (datetime.now() - timedelta(days=random.randint(1, 30))).isoformat(),
        }


seed_data()


def generate_fake_user() -> dict:
    first = random.choice(["Alice", "Bob", "Charlie", "Diana", "Eve", "Frank"])
    last = random.choice(["Smith", "Johnson", "Williams", "Brown", "Jones"])
    return {
        "name": f"{first} {last}",
        "email": f"{first.lower()}.{last.lower()}@example.com",
        "username": f"{first.lower()}_{last.lower()}_{random.randint(1, 999)}",
        "phone": f"+1-{random.randint(200, 999)}-{random.randint(100, 999)}-{random.randint(1000, 9999)}",
        "address": {
            "street": f"{random.randint(1, 9999)} {random.choice(['Main', 'Oak', 'Pine', 'Maple'])} St",
            "city": random.choice(["New York", "Los Angeles", "Chicago", "Houston", "Phoenix"]),
            "zip": f"{random.randint(10000, 99999)}",
            "country": "USA",
        },
        "avatar": f"https://i.pravatar.cc/150?u={uuid.uuid4()}",
        "uuid": str(uuid.uuid4()),
    }


def generate_fake_product() -> dict:
    adjectives = ["Premium", "Ultra", "Smart", "Eco", "Pro", "Lite", "Max", "Mini"]
    nouns = ["Laptop", "Phone", "Watch", "Headphones", "Camera", "Tablet", "Speaker", "Monitor"]
    return {
        "name": f"{random.choice(adjectives)} {random.choice(nouns)} {random.randint(1, 9)}",
        "price": round(random.uniform(29.99, 1999.99), 2),
        "sku": f"SKU-{''.join(random.choices(string.ascii_uppercase + string.digits, k=8))}",
        "category": random.choice(["Electronics", "Books", "Clothing", "Food", "Toys"]),
        "stock": random.randint(0, 500),
        "rating": round(random.uniform(1.0, 5.0), 1),
        "description": f"A high-quality {random.choice(nouns).lower()} for everyday use.",
        "tags": random.sample(["new", "sale", "bestseller", "limited", "featured"], k=random.randint(1, 3)),
    }
