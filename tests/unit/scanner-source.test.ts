import { describe, it, expect } from 'vitest';
import { scanFiles, detectFrameworkFromFiles } from '../../src/renderer/src/lib/scanner/sourceScanner';

function makeFiles(entries: Record<string,string>): Map<string,string> {
  return new Map(Object.entries(entries));
}

describe('sourceScanner — framework detection', () => {
  it('detects Express from package.json', () => {
    const files = makeFiles({
      'package.json': JSON.stringify({ dependencies: { express: '^4.18' } }),
      'routes/auth.js': "router.post('/login', handler)",
    });
    const { framework, language } = detectFrameworkFromFiles(files);
    expect(framework).toBe('Express');
    expect(language).toBe('javascript');
  });

  it('detects FastAPI from requirements.txt', () => {
    const files = makeFiles({
      'requirements.txt': 'fastapi==0.110\nuvicorn',
      'app.py': "from fastapi import FastAPI\napp = FastAPI()",
    });
    const { framework } = detectFrameworkFromFiles(files);
    expect(framework).toBe('FastAPI');
  });

  it('detects Laravel from composer.json', () => {
    const files = makeFiles({ 'composer.json': JSON.stringify({ require: { 'laravel/framework': '^10' } }) });
    expect(detectFrameworkFromFiles(files).framework).toBe('Laravel');
  });

  it('detects SpringBoot from pom.xml', () => {
    const files = makeFiles({ 'pom.xml': '<artifactId>spring-boot-starter-web</artifactId>' });
    expect(detectFrameworkFromFiles(files).framework).toBe('SpringBoot');
  });

  it('detects Gin from go.mod', () => {
    const files = makeFiles({ 'go.mod': 'module example\nrequire github.com/gin-gonic/gin v1.9' });
    expect(detectFrameworkFromFiles(files).framework).toBe('Gin');
  });

  it('detects AspNetCore from csproj', () => {
    const files = makeFiles({ 'MyApp.csproj': '<Project><PackageReference Include="Microsoft.AspNetCore.App" /></Project>' });
    expect(detectFrameworkFromFiles(files).framework).toBe('AspNetCore');
  });
});

describe('sourceScanner — Express parsing (plan §8)', () => {
  const EXPRESS_AUTH_JS = `
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

/**
 * Authenticate user and return JWT token
 * @route POST /auth/login
 */
router.post('/login', authController.login);
router.post('/refresh', authController.refresh);
module.exports = router;
`;
  const EXPRESS_USERS_JS = `
const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const userController = require('../controllers/userController');
router.use(authenticate);
router.get('/', userController.list);
router.get('/:id', userController.show);
router.post('/', userController.create);
router.put('/:id', userController.update);
router.delete('/:id', userController.destroy);
module.exports = router;
`;

  it('parses Express routes with handler and params', () => {
    const files = makeFiles({
      'package.json': JSON.stringify({ dependencies: { express: '^4' }}),
      'routes/auth.js': EXPRESS_AUTH_JS,
      'routes/users.js': EXPRESS_USERS_JS,
    });
    const res = scanFiles(files, 'Express');
    expect(res.totalFiles).toBeGreaterThanOrEqual(2);
    expect(res.totalRoutes).toBeGreaterThanOrEqual(7);
    const keys = new Set(res.routes.map(r => `${r.method} ${r.path}`));
    expect(keys.has('POST /login')).toBe(true);
    expect(keys.has('GET /:id')).toBe(true);
    expect(keys.has('DELETE /:id')).toBe(true);
    // params extraction
    const withParam = res.routes.find(r => r.path === '/:id');
    expect(withParam?.params.some(p=>p.name==='id')).toBe(true);
  });

  it('groups via generator', async () => {
    const { generateCollectionNode } = await import('../../src/renderer/src/lib/scanner/sourceScanner');
    const files = makeFiles({
      'package.json': JSON.stringify({ dependencies: { express: '^4' }}),
      'app.js': "app.use('/api/v1/users', require('./routes/users'))",
      'routes/auth.js': EXPRESS_AUTH_JS,
    });
    const scan = scanFiles(files, 'Express');
    const node: any = generateCollectionNode(scan, 'http://localhost:3000');
    expect(node.name).toContain('Express');
    expect(node.folders.length).toBeGreaterThan(0);
  });
});

describe('sourceScanner — FastAPI', () => {
  const PY_CONTENT = `
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
def list_users(page: int = Query(1, ge=1), limit: int = Query(10)):
    pass

@app.get("/v1/users/{user_id}")
def get_user(user_id: str):
    pass

@app.get("/v1/products/{product_id}")
def get_product(product_id: str):
    pass
`;
  it('parses FastAPI decorators and path params', () => {
    const files = makeFiles({ 'app.py': PY_CONTENT, 'requirements.txt': 'fastapi' });
    const res = scanFiles(files, 'FastAPI');
    expect(res.totalRoutes).toBeGreaterThanOrEqual(4);
    const keys = new Set(res.routes.map(r => `${r.method} ${r.path}`));
    expect(keys.has('POST /v1/auth/login')).toBe(true);
    expect(keys.has('GET /v1/users')).toBe(true);
    expect(keys.has('GET /v1/users/{user_id}')).toBe(true);
    const withQuery = res.routes.find(r => r.path === '/v1/users');
    expect(withQuery?.params.some(p=>p.name==='page')).toBe(true);
  });
});

describe('sourceScanner — Laravel', () => {
  const CONTENT = `
<?php
use Illuminate\\Support\\Facades\\Route;
Route::group(['prefix' => 'api'], function() {
    Route::get('/users', [UserController::class, 'index']);
    Route::post('/users', [UserController::class, 'store']);
    Route::get('/users/{id}', [UserController::class, 'show']);
});
Route::resource('products', ProductController::class);
`;
  it('parses Laravel routes and resource expansion', () => {
    const files = makeFiles({ 'routes/api.php': CONTENT, 'composer.json': '{"require":{"laravel/framework":"^10"}}' });
    const res = scanFiles(files, 'Laravel');
    expect(res.totalRoutes).toBeGreaterThanOrEqual(3+8); // 3 explicit + 8 resource
    const keys = new Set(res.routes.map(r => `${r.method} ${r.path}`));
    expect(keys.has('GET api/users')).toBe(true);
    expect(keys.has('POST api/users')).toBe(true);
  });
});

describe('sourceScanner — Spring Boot', () => {
  const JAVA = `
@RestController
@RequestMapping("/api/v1/users")
public class UserController {
    @GetMapping("/{id}")
    public ResponseEntity<User> getUser(@PathVariable String id) { return null; }
    @PostMapping
    public ResponseEntity<User> create(@RequestBody User body) { return null; }
    @GetMapping
    public List<User> list(@RequestParam String role) { return null; }
}
`;
  it('parses Spring annotations', () => {
    const files = makeFiles({ 'src/main/java/UserController.java': JAVA, 'pom.xml': 'spring-boot' });
    const res = scanFiles(files, 'SpringBoot');
    expect(res.totalRoutes).toBeGreaterThanOrEqual(3);
    const keys = new Set(res.routes.map(r => `${r.method} ${r.path}`));
    // class mapping /api/v1/users + method /{id} -> full
    expect(keys.has('GET /api/v1/users/{id}')).toBe(true);
    expect(keys.has('POST /api/v1/users')).toBe(true);
  });
});

describe('sourceScanner — ASP.NET', () => {
  const CS = `
[ApiController]
[Route("api/[controller]")]
public class UsersController : ControllerBase {
    [HttpGet]
    public IActionResult List() => Ok();
    [HttpGet("{id}")]
    public IActionResult Get(string id) => Ok();
    [HttpPost]
    public IActionResult Create([FromBody] UserDto dto) => Ok();
    [Authorize]
    [HttpDelete("{id}")]
    public IActionResult Delete(string id) => Ok();
}
`;
  it('parses AspNet attributes', () => {
    const files = makeFiles({ 'Controllers/UsersController.cs': CS, 'App.csproj': '<PackageReference Include="Microsoft.AspNetCore.App" />' });
    const res = scanFiles(files, 'AspNetCore');
    expect(res.totalRoutes).toBeGreaterThanOrEqual(4);
    const keys = new Set(res.routes.map(r => `${r.method} ${r.path}`));
    expect(keys.has('GET /api/users')).toBe(true);
    expect(keys.has('GET /api/users/{id}')).toBe(true);
    const authRoute = res.routes.find(r => r.method==='DELETE');
    expect(authRoute?.authRequired).toBe(true);
  });
});

describe('sourceScanner — Gin', () => {
  const GO = `
package main
func main() {
    r := gin.Default()
    api := r.Group("/api/v1")
    {
        api.GET("/users/:id", getUser)
        api.POST("/users", createUser)
        r.GET("/health", health)
    }
}
`;
  it('parses Gin routes with group prefix', () => {
    const files = makeFiles({ 'main.go': GO, 'go.mod': 'require github.com/gin-gonic/gin v1.9' });
    const res = scanFiles(files, 'Gin');
    expect(res.totalRoutes).toBeGreaterThanOrEqual(3);
    const keys = new Set(res.routes.map(r => `${r.method} ${r.path}`));
    expect(keys.has('GET /api/v1/users/:id')).toBe(true);
    expect(keys.has('POST /api/v1/users')).toBe(true);
  });
});

describe('sourceScanner — deduplication', () => {
  it('dedupes same METHOD:PATH across files', () => {
    const files = makeFiles({
      'a.js': "router.get('/users', h1)",
      'b.js': "router.get('/users', h2)", // duplicate
      'package.json': JSON.stringify({ dependencies: { express: '^4'}})
    });
    const res = scanFiles(files, 'Express');
    const getUsers = res.routes.filter(r=>r.method==='GET' && r.path==='/users');
    expect(getUsers.length).toBe(1);
  });
});
