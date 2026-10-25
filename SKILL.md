---
name: lavalust-backend
description: Build, refactor or review a PHP backend that strictly follows the LavaLust MVC framework (v4). Use when the user mentions LavaLust, or gives a rubric and frontend whose endpoints the backend must match.
---

# LavaLust Backend Skill

**Portable instructions.** If this file is pasted into another AI, treat everything below as binding. Facts here were verified by reading the LavaLust 4.7.0 source and by *running* it (PHP 8.3, SQLite). Marks: ✅ = executed and confirmed, 📖 = read from source only (not executed), ⚠ = a trap. For anything not covered here, read the official docs (https://lavalust.netlify.app/docs/) or the source in `scheme/` before writing code. **Never guess a method name; this framework's API is snake_case and differs from Laravel/CodeIgniter in important ways.**

---

## 1. Workflow (follow in order)

1. **Rubric → checklist.** Extract every gradable requirement (features, endpoints, roles/auth, validation, CRUD, DB tables, security, code quality). Keep it as a checklist and tick items off at the end.
2. **Frontend → endpoint contract.** Search the frontend for every network call (`fetch`, `axios`, `$.ajax`, `XMLHttpRequest`, `<form action>`). For each one record: HTTP method, path, path/query params, request body **and Content-Type** (JSON vs FormData/urlencoded), auth (Bearer header or cookie), the exact response fields the UI reads (e.g. `res.data.items`), the status codes/error shape it handles, and pagination params. Write them into a table (template in §9). **The frontend wins:** adapt backend paths, field names and response shape to what the frontend already calls. Change the frontend only if the user allows it.
3. **Map to MVC.** `route → Controller::method → Model → table`. One controller and one model per resource.
4. **Build the minimum.** Create only what the contract and rubric need. Remove demo scaffolding (§2.4).
5. **Verify.** `php -l` every PHP file; `php lava route:list`; start the server (`php lava serve`, default `127.0.0.1:3000`, or `php -S 127.0.0.1:3000 -t public`) and `curl` every endpoint against the contract: success, validation failure, not found, unauthorized.
6. **Report.** Give the user the contract table and which rubric items are satisfied.

### "Clean and simple" rules
- Controllers are thin: read input → validate → call model → send response. SQL/query logic lives in models.
- One resource per controller. No unused methods, routes, loaded libraries, models, helpers, config, or commented-out code.
- Do not build wrappers for things the framework already provides (`$this->request`, `$this->response`, model CRUD).
- Create a shared base controller only when 2+ controllers need the same hook (§5.1).
- Pick **one** JSON response shape for the whole project and use it everywhere (§5.4).
- Use the framework API only: never raw `$_POST/$_GET`, `header()`, `http_response_code()`, `echo json_encode()` in controllers. (One deliberate exception: the JSON→`$_POST` bridge in §5.1.)
- Never concatenate SQL. Use the query builder or `raw($sql, [params])`.

---

## 2. Project facts

### 2.1 Layout (web root must be `public/`)
```
app/
  config/       config.php, database.php, routes.php, autoload.php, middleware.php, api.php, ...
  controllers/  FLAT folder (no subfolders, see trap T4)
  models/
  middlewares/
  views/        (errors/ must stay)
  helpers/ libraries/ language/ migrations/ kernel/ modules/
scheme/         framework core, NEVER edit
public/         index.php + .htaccess (front controller) + static assets
runtime/        must be writable (logs, cache, session security file)
.env            DB_*, APP_ENV, APP_KEY, JWT_SECRET, REFRESH_TOKEN_KEY   (never commit)
lava            CLI (php lava ...)
```

### 2.2 Request lifecycle ✅
`public/index.php` → `scheme/kernel/LavaLust.php` (loads `.env`, config, core classes: request, response, router…) → `app/config/routes.php` → router matches **HTTP method + URL** → middleware → `new Controller()` (runs autoload, then `before_action()`) → action receives `{placeholders}` as arguments. Any `OPTIONS` request is answered globally with 204 + CORS headers before routing ✅.

### 2.3 Requirements
PHP **8.0+** in practice (README says 7.4, but the kernel uses PHP 8 functions such as `str_contains`). PDO + driver (mysql, pgsql, sqlite, sqlsrv supported). Apache `mod_rewrite` or `php -S`.

### 2.4 Cleaning up (API-only backend)
Safe to remove when unused: `app/controllers/Welcome.php`, `app/views/welcome_page.php`, the `Welcome::index` route, `app/migrations/*` (if you ship a `.sql` file instead), `app/config/ember.php`/`migration.php` (if unused). **Keep:** all of `scheme/`, `app/views/errors/`, both `.htaccess` files, `runtime/`, and any config file still referenced.

### 2.5 Configuration ✅
`.env` (parsed by LavaLust itself; `#` comments; quotes stripped):
```
APP_ENV=development
APP_KEY=<php lava key:generate>
DB_DRIVER=mysql
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=mydb
DB_CHARSET=utf8mb4
JWT_SECRET=<php lava jwt:generate>        # only if using JWT
REFRESH_TOKEN_KEY=<php lava jwt:generate> # only if using JWT
```
`app/config/autoload.php`: **real keys are `libraries`, `helpers`, `models`, `configs`** (the docs page shows wrong key names):
```php
$autoload['libraries'] = array('database');        // add 'session' for cookie login
$autoload['helpers']   = array('url');             // base_url(), site_url(), redirect()
$autoload['models']    = array();
$autoload['configs']   = array('middleware');      // ⚠ REQUIRED if you use middleware (T3)
```
`app/config/config.php`: `base_url` (empty = auto-detect), `date_default_timezone`, `timestamps` / `soft_delete` (global model defaults), and **CORS for a separate-origin frontend**: edit the existing `'cors'` array inside `$config['security_headers']`:
```php
'cors' => [
    'allowed_origins' => ['http://localhost:5173'],   // exact origins, no trailing slash; '*' allowed (never with credentials)
    'credentials'     => false,
    'methods'         => 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'headers'         => 'Authorization, Content-Type, X-Requested-With',
    'max_age'         => 600,
],
```
Keep `csrf_protection` FALSE (default) for JSON/Bearer APIs. 📖 Its logic is unusual (it only inspects requests when `csrf_exclude_uris` is non-empty), so test thoroughly before enabling.

---

## 3. Naming and file rules
- Directories are **lowercase**. File name = class name: `ProductController.php` → `class ProductController extends Controller`; `ProductModel.php` → `class ProductModel extends Model`; `AuthMiddleware.php` → `class AuthMiddleware`.
- Every PHP file under `app/` starts with:
  ```php
  <?php
  defined('PREVENT_DIRECT_ACCESS') OR exit('No direct script access allowed');
  ```
- Methods and framework calls are `snake_case`. Do not use `$this->io` (deprecated in 4.7.0).
- Loaded things become properties: `$this->call->model('ProductModel')` → `$this->ProductModel`; `$this->call->library('form_validation')` → `$this->form_validation`; the autoloaded database → `$this->db`; always available: `$this->request`, `$this->response`, `$this->call`.

---

## 4. Routes (`app/config/routes.php`, variable `$router`) ✅
```php
$router->get('/api/products', 'ProductController::index');
$router->get('/api/products/{id}', 'ProductController::show')->where_number('id');
$router->post('/api/products', 'ProductController::store');
$router->put('/api/products/{id}', 'ProductController::update')->where_number('id');
$router->delete('/api/products/{id}', 'ProductController::destroy')->where_number('id');

$router->group(['prefix' => '/api', 'middleware' => 'auth'], function ($router) {
    $router->get('/me', 'AuthController::me');
});
```
- Verbs: `get post put patch delete options any match($url, $cb, ['get','post'])`.
- Handlers: `'Controller::method'` (also `->` or `@`), `[Controller::class, 'method']`, a closure, or just `'Controller'` (calls `index()`).
- Placeholders `{id}`, optional `{tab?}`; arguments are passed positionally. Constraints: `where($p, $regex)`, `where_number`, `where_alpha`, `where_alphanumeric`, `where_uuid`, `where_ulid`, `where_in`. A failed constraint returns 404.
- `->middleware('auth')` / `['auth','admin']`, group `middleware`, `$router->add_global_middleware('x')`, `->name('n')`.
- First matching route (by method + pattern, in registration order) wins. Put static paths (`/products/export`) before dynamic ones (`/products/{id}`).
- Only the **flat** `app/controllers/` folder works through the router (T4).
- An HTML `<form>` can only send GET/POST, so register those routes with `post`. ⚠ ✅ The router dispatches on the **real** HTTP method: a POST with `X-HTTP-Method-Override: PUT` gets **404** on a `put` route (only `$this->request->method()` honors the header). `fetch`/`axios` can send real PUT/PATCH/DELETE.

---

## 5. Templates (copy, then adapt)

### 5.1 Base controller for JSON APIs ✅
`app/controllers/ApiController.php`. Not routed; children `require_once` it.
```php
<?php
defined('PREVENT_DIRECT_ACCESS') OR exit('No direct script access allowed');

class ApiController extends Controller
{
    // Runs inside Controller::__construct(), i.e. BEFORE the child loads form_validation.
    public function before_action()
    {
        handle_cors();                               // CORS for real requests (T9)
        if ($this->request->is_json()) {
            $_POST = $this->request->json() ?: [];   // lets $this->form_validation read JSON bodies (T5)
        }
    }

    protected function fail($message, $code = 400)
    {
        $this->response->send_json_error($message, $code);
        exit;                                         // send_json_* does NOT stop execution (T2)
    }
}
```
If there is only one controller, put these two members directly in it. If the frontend and API share an origin (frontend files served from `public/`), `handle_cors()` can be dropped.

### 5.2 Resource controller (CRUD) ✅
```php
<?php
defined('PREVENT_DIRECT_ACCESS') OR exit('No direct script access allowed');
require_once __DIR__ . '/ApiController.php';

class ProductController extends ApiController
{
    public function __construct()
    {
        parent::__construct();                          // always first
        $this->call->model('ProductModel');
        $this->call->library('form_validation');
    }

    public function index()
    {
        $page = max(1, $this->request->integer('page', 1));
        $this->response->send_json_success(
            $this->ProductModel->search($this->request->get('category'), $page, 10)
        );
    }

    public function show($id)
    {
        $row = $this->ProductModel->find($id);
        if (!$row) {
            $this->fail('Product not found', 404);
        }
        $this->response->send_json_success($row);
    }

    public function store()
    {
        $ok = $this->form_validation->validate([
            'name'  => 'required|min_length[2]',
            'price' => 'required|numeric',
        ]);
        if (!$ok) {
            return $this->response->send_json_validation($this->form_validation->get_errors()); // 422
        }
        $id = $this->ProductModel->insert($this->request->only(['name', 'price', 'category']));
        $this->response->send_created($this->ProductModel->find($id));                           // 201
    }

    public function update($id)
    {
        if (!$this->ProductModel->find($id)) {
            $this->fail('Product not found', 404);
        }
        $this->ProductModel->update($id, $this->request->only(['name', 'price', 'category']));
        $this->response->send_json_success($this->ProductModel->find($id));
    }

    public function destroy($id)
    {
        if (!$this->ProductModel->find($id)) {
            $this->fail('Product not found', 404);
        }
        $this->ProductModel->delete($id);
        $this->response->send_json_success(null, 'Deleted');
    }
}
```
Input accessors that work for **JSON, form, and PUT/PATCH/DELETE** bodies: `input($k, $default)`, `all()`, `only([...])`, `except([...])`, `has($k)`, `filled($k)`, `integer($k, $d)`, `float($k, $d)`, `boolean($k, $d)`, `string($k, $d)`. `only()` returns only the keys that were sent, so partial updates just work.

### 5.3 Model ✅
```php
<?php
defined('PREVENT_DIRECT_ACCESS') OR exit('No direct script access allowed');

class ProductModel extends Model
{
    protected $table      = 'products';
    protected $primary_key = 'id';
    protected $fillable   = ['name', 'price', 'category'];  // ALWAYS define; `id` is guarded by default
    protected $timestamps = true;                           // needs created_at + updated_at columns
    // protected $has_soft_delete = true;                   // needs deleted_at column

    // $this->db is ONE shared builder: finish each chain before starting another.
    private function filtered($category)
    {
        $q = $this->db->table($this->table);
        return $category ? $q->where('category', $category) : $q;
    }

    // Filtered pagination (do NOT use Model::paginate with conditions, see T6)
    public function search($category, $page, $per_page)
    {
        $rows  = $this->filtered($category)->order_by('id', 'DESC')->limit($per_page, ($page - 1) * $per_page)->get_all();
        $total = $this->filtered($category)->count();

        return [
            'items'        => $rows,
            'total'        => $total,
            'per_page'     => $per_page,
            'current_page' => $page,
            'last_page'    => (int) ceil($total / $per_page),
        ];
    }
}
```
Models reach the DB through `$this->db`, which requires `'database'` in `$autoload['libraries']` (or `$this->call->library('database')`).

### 5.4 Response helpers and the JSON shape ✅
| Call | Status | Body |
|---|---|---|
| `send_json_success($data=null, $msg='Success', $code=200)` | 200 | `{success:true, message, data?}` |
| `send_created($data)` | 201 | `{success:true, message:'Created', data}` |
| `send_json_error($msg, $code=400, $extra=[])` | given | `{success:false, error:$msg, …$extra}` |
| `send_json_validation($errors)` | 422 | `{success:false, error:'Validation failed', errors:[…]}` |
| `send_not_found / send_unauthorized / send_forbidden / send_method_not_allowed / send_too_many_requests / send_server_error` | 404/401/403/405/429/500 | error shape above |
| `send_no_content()` | 204 | none |
| `send_json($payload, $code=200)` | given | **exact payload you pass** |

⚠ `send_json_success()` always wraps your payload in `data` (and `Model::paginate()` itself returns a `data` key, giving `data.data`). If the frontend expects another shape (e.g. a bare array, `{items,total}`, `{status:'ok'}`), use `send_json($exactPayload, $code)`. The `Api` library's own helpers use a different shape (`respond_error` → `{error,status}`), so don't mix them with `$this->response` in one project.

### 5.5 Middleware ✅
`app/middlewares/AuthMiddleware.php`:
```php
<?php
defined('PREVENT_DIRECT_ACCESS') OR exit('No direct script access allowed');

class AuthMiddleware
{
    public function handle(Closure $next)
    {
        if (lava_instance()->request->bearer_token() !== 'expected') {   // real check goes here
            lava_instance()->response->send_unauthorized('Login required');
            return;                                                      // not calling $next() stops the request
        }
        return $next();
    }
}
```
Register in `app/config/middleware.php`, **and** list `middleware` in `$autoload['configs']` (T3):
```php
$config['middlewares'] = [
    'auth' => load_class('AuthMiddleware', 'middlewares'),
];
```
Attach: `->middleware('auth')` or a group. Middleware are plain classes (no `$this->request`); use `lava_instance()`. Their constructors run at config load time, so keep them dependency-free.

### 5.6 Auth option A: session (cookie) login ✅/📖
`$this->call->library('session')` (or autoload it). ✅ `set_userdata('k', $v)` / `userdata('k')` persist across requests.
```php
public function login()
{
    $user = $this->UserModel->find_by('email', $this->request->input('email'));
    if (!$user || !password_verify((string) $this->request->input('password'), $user['password'])) {
        $this->fail('Invalid credentials', 401);
    }
    $this->session->regenerate_on_login();                                  // 📖 prevents session fixation
    $this->session->set_userdata(['user_id' => $user['id'], 'role' => $user['role']]);   // 📖 array form
    $this->response->send_json_success(['id' => $user['id'], 'role' => $user['role']]);
}
// logout: $this->session->sess_destroy();    guard: $this->session->userdata('user_id')
```
In production, `APP_KEY` must be set in `.env`, or the Session library throws. Store passwords with `password_hash($p, PASSWORD_DEFAULT)`. Cookie sessions work out of the box when the frontend is **same-origin**. For a separate-origin frontend you must also set `credentials => true` with an exact origin in CORS, `fetch(..., {credentials:'include'})`, and adjust `cookie_samesite`/`cookie_secure` (not verified here); prefer option B.

### 5.7 Auth option B: JWT Bearer (`Api` library)
Setup: `app/config/api.php` → `$config['api_helper_enabled'] = TRUE;`. `.env` needs `JWT_SECRET` and `REFRESH_TOKEN_KEY`: each ≥ 32 chars, ≥ 10 distinct characters, and different from each other (`php lava jwt:generate`), otherwise the library halts with `show_error`. Tables: `users` (needs `id` and `role`; roles `admin|editor|user` map to scopes), and `refresh_tokens` (`id, user_id, token, expires_at, jti`; see `app/migrations/002_*`).
```php
$this->call->library('api');                              // → $this->api
$payload = $this->api->require_jwt();                     // ✅ 401 JSON if missing/invalid; ['sub'=>userId, 'role'=>from DB]
$tokens  = $this->api->issue_tokens(['id' => $user['id'], 'role' => $user['role']]);   // 📖 {access_token, refresh_token, expires_in, token_type}
```
✅ Verified: `encode_jwt`, `validate_jwt` (rejects tampered tokens), `require_jwt` (the role comes from the `users` table even if the token claims another). 📖 Not executed (no MySQL available): `issue_tokens`, `refresh_access_token`, `revoke_refresh_token`; they use MySQL's `NOW()`, so **refresh tokens will not work on SQLite**. Loading the library also applies API security headers, CORS, and a body guard (415 for unsupported Content-Type on POST/PUT/PATCH). `$this->api->respond()` **exits**; `$this->response->send_*` does not.

### 5.8 Validation ✅
```php
$ok     = $this->form_validation->validate(['email' => 'required|valid_email', 'password' => 'required|min_length[6]', 'confirm' => 'required|matches[password]']);
$errors = $this->form_validation->get_errors();     // array of messages; null when valid
```
Rules available (📖 all exist; ✅ = executed): `required` ✅ `min_length[n]` ✅ `max_length[n]` `exact_length[n]` `valid_email` ✅ `numeric` ✅ `alpha` `alpha_numeric` `alpha_numeric_space` `alpha_space` `alpha_numeric_dash` `greater_than[n]` ✅ `greater_than_equal_to[n]` `less_than[n]` `less_than_equal_to[n]` `matches[field]` ✅ `differs[field]` `in_list` `is_unique`. Labels: key `'email|E-mail'`. Custom messages 📖: `validate($rules, ['email' => ['required' => 'Email is needed']])`. `in_list` needs quotes and `is_unique` needs the workaround in T14. Validation reads `$_POST`, so JSON needs the bridge from §5.1.

### 5.9 Transactions ✅
```php
$this->db->transaction();
try {
    // several writes…
    $this->db->commit();
} catch (Throwable $e) {
    $this->db->roll_back();                 // NOT rollback() (T7)
    $this->fail('Could not save', 500);
}
```

---

## 6. Verified traps (read before coding)

| # | Trap | What to do |
|---|---|---|
| T1 ✅ | `redirect()` **does not exit** (source: `($exit === true) ?? exit();` never exits). Code after it still runs. | `redirect(...); return;` (or `exit;`). APIs should return JSON, not redirects. |
| T2 ✅ | `$this->response->send_json*()`, `send_created()`, `send_not_found()` etc. **do not stop execution**; later `echo`/logic still runs. | `return` after them, or use `fail()` with `exit` (§5.1). |
| T3 ✅ | Middleware: `app/config/middleware.php` is **not loaded by default**. Without it, any route with middleware fails with "Middleware config not found". The docs omit this. An alias missing from `$config['middlewares']` fails with "Middleware [x] not registered", and the route is then effectively unprotected-looking (HTML error, HTTP 200, T10). | `$autoload['configs'] = array('middleware');` and register every alias. |
| T4 ✅ | Controllers in subfolders (`'Admin/UserController::x'`, `'Admin\UserController::x'`) **fail** in the router. The docs example is misleading. | Keep `app/controllers/` flat; unique class names; separate areas with route prefixes (`/admin/...`). |
| T5 ✅ | For a JSON body, `$this->request->post()` is **empty** and `Form_validation` (reads only `$_POST`) fails every `required`. | Use `input()/all()/only()`; bridge JSON into `$_POST` inside `before_action()` (§5.1) **before** loading `form_validation`. |
| T6 ✅ | `Model::paginate($per, $page, $conditions)` returns **wrong rows** with conditions (total is filtered, data is not). | Custom model method with the builder (§5.3). Unfiltered `paginate()` is fine. |
| T7 ✅ | `Model::rollback()` calls a method that doesn't exist (fatal Error). `transaction()`/`commit()` are fine. | `$this->db->roll_back()`. |
| T8 ✅ | `Model::filter(...)->get_all()` throws. `group_by()/having()/scope()` followed by `->query()` are **silently ignored** (`query()` resets the builder). `with([...])` on `has_one`/`has_many` throws. | Use the builder directly: `$this->db->table(...)->left_join(...)->where(...)->group_by(...)->get_all()` (✅ joins work). `belongs_to` eager loading was not tested; avoid. |
| T9 ✅ | CORS headers are **not** added to normal requests automatically (only `OPTIONS` preflight is handled globally). A browser on another origin will block the response. | Call `handle_cors()` in `before_action()` and set `allowed_origins` (§2.5). Disallowed origins simply get no header. |
| T10 ✅ | 404 pages are **HTML**. Uncaught exceptions return **HTTP 200**: an HTML error page in development, an **empty body** in production. | Handle every expected failure explicitly with `fail()`/`send_json_*`; never rely on exceptions for control flow; test the frontend's error path. |
| T11 ✅ | `update()` returns the PDO row count (SQLite counted matched rows; MySQL's PDO default counts only *changed* rows, so it can be 0 on an unchanged update, 📖 not tested here); `delete()` affected rows; `find()` returns `false` when missing; `insert()` returns the new id, or `false` if no field was fillable. | Check existence with `find()` first; don't treat `update()`'s return as "found". |
| T12 ✅/📖 | ✅ With `$fillable` set, unlisted keys (including `id`) are dropped. 📖 With `$fillable` empty it falls back to `$guarded = ['id']` (everything else mass-assignable). | Always define `$fillable`; also pass only `request->only([...])`. |
| T13 ✅ | `$this->db` is one shared stateful builder. `table()` resets it. Interleaving a second query (or a model call) between `table()` and `get_all()` corrupts the first. | Complete each chain in one expression; compute then reuse the values. |
| T14 ✅ | `in_list[a,b]` in a rule string breaks (the comma splits the list). `is_unique` uses PDO `rowCount()` on a SELECT, which fails to detect duplicates on SQLite (likely fine on MySQL, 📖). | `in_list["a,b"]` (quote the list) ✅. Uniqueness: `$this->XModel->exists(['email' => $v])` ✅ works on any driver. |
| T15 ✅ | `php lava make:controller` / `make:model` write to `app/Controllers/` and `app/Models/` (capitalized), which the router does not read on case-sensitive systems (Linux hosting). Generated controllers also don't add the `Controller` suffix. | Write controllers/models by hand into the lowercase folders (or move them). `make:middleware` is fine (lowercase dir, appends `Middleware`). |
| T16 ✅ | `Model::order_by()` and `limit()` run immediately and return rows (not chainable). | For chains use `$this->db->table(...)->order_by()->limit()->get_all()`. |
| T17 ✅ | Query builder `get()` returns **one associative array or `false`**; `get_all()` returns an **array of associative arrays** (`[]` if none). Rows are **arrays, not objects** (the README's `->getResult()` example does not exist). | `$row['name']`, never `$row->name`. |
| T19 ✅ | `php lava route:list` regex-scans the text of `routes.php`; it ignores group prefixes (shows `/secret` for `/api/secret`), middleware and array-style handlers. | Verify routes with `curl`, not `route:list`. |
| T18 📖 | Docs show `$autoload['helper']`/`['model']`. Real keys are plural (§2.5). README's `Api` sample puts `$this->call->library('api')` outside a method (invalid PHP). | Trust the source files over README/docs when they disagree. |

---

## 7. Quick reference (all names verified in source)

**Request** `$this->request`: `get($k,$d) post($k,$d) put patch delete input all only except has has_any filled missing integer float boolean string json($assoc=true) raw_body file($k) files has_file method($upper=false) is_method is_get is_post is_put is_patch is_delete is_ajax is_json wants_json bearer_token header($name) headers ip_address uri path url query_string cookie set_cookie delete_cookie`

**Query builder** `$this->db`: `table select select_count/max/min/sum/avg/distinct($col,$alias) join inner_join left_join right_join where($col,$val) where($col,$op,$val) where([...]) or_where not_where where_null where_not_null like or_like not_like between in not_in (each has or_ variants) grouped(Closure) order_by($col,$dir) group_by having limit($n,$offset) offset pagination($perPage,$page) get get_all count insert($arr) update($arr) delete increment($col,$n) decrement bulk_insert bulk_update($rows,$key) last_id row_count get_sql raw($sql,$params) transaction commit roll_back`. `update()` and `delete()` need a preceding `where()`.

**Model** (call as `$this->XModel->method()`): `all find($id) find_by($col,$v) find_all_by first last value($col,$cond) pluck($col,$cond) exists($cond) count() insert update($id,$data) delete($id) update_where($cond,$data) delete_where($cond) bulk_insert bulk_update first_or_create update_or_create sum/max/min/avg($col,$cond) soft_delete restore transaction commit`, plus `query()` (returns the builder). ✅ executed, except `bulk_update`, `min`, `avg` (📖 same code shape as `max`/`sum`). `all(true)`/`find($id,true)` include soft-deleted rows. `count()` takes no conditions; use the builder for filtered counts.

**Libraries** (`$this->call->library('x')`): `form_validation, session, api, cache, email, encryption, upload, pagination, migration, profiler, ember`. **Helpers** (`$this->call->helper('x')`): `url` (`base_url site_url redirect`), `string`, `security` (`csrf_field sanitize_filename filter_io`), `cookie`, `file`, `directory`, `download`, `language`, `debug` (`dd dump`). Always available without loading: `show_404() show_error() html_escape() config_item() handle_cors() lava_instance() load_class()`.

**CLI**: `php lava serve [--port=n]`, `route:list` (T19), `key:generate`, `jwt:generate [--show --force]`, `env:check`, `cache:clear`, `make:middleware|helper|library|view|config|command|language` (see T15 for controller/model).

**Views** (📖, only if the rubric needs server-rendered pages): `$this->call->view('folder/name', ['k' => $v])` renders `app/views/folder/name.php`, each key becomes a variable; escape output with `html_escape()`; static assets live in `public/`.

---

## 8. Not verified (read the docs and test before using)
`upload`, `email`, `cache`, `pagination` library, `encryption`, `migration`/DBForge (MySQL oriented), Ember templates, modules (`app/modules`), CSRF protection, `many_to_many`/`belongs_to` eager loading, bulk_update, JWT refresh flow, cross-origin cookie sessions, MySQL-specific behavior generally (all execution tests ran on SQLite; MySQL-only code paths such as `NOW()` and PDO `rowCount()` semantics may differ). If you use any of these, test it with `curl` and say it is unverified.

---

## 9. Deliverable templates

**Endpoint contract**
| # | Frontend file:line | Method + path | Request (type + fields) | Auth | Response the UI reads | Errors handled | Controller::method |
|---|---|---|---|---|---|---|---|

**Final checklist**
- [ ] Every contract row has a route, controller method, and passes a `curl` test (success, 422, 404, 401).
- [ ] Response shape matches what the frontend code reads (field names and nesting).
- [ ] CORS origin set (or same-origin); Content-Type handling matches (JSON bridge if JSON).
- [ ] Models define `$fillable`; no raw SQL concatenation; no logic left in routes.
- [ ] No demo files, dead routes, unused loads/config/comments.
- [ ] `.env` not committed; `.env.example` lists the keys; DB schema delivered (`.sql` or migrations).
- [ ] Each rubric item is mapped to a file/feature and ticked.
- [ ] None of T1 to T19 is violated.
