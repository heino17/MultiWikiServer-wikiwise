
### Sessions and Login

- `GET /login` and `POST /logout`
- parse incoming requests and provide AuthUser

### Users and Roles

- the user management UI
- provide lists for other features
  - the list of roles `[name, description]`
  - the list of users `[id, username]`

### Recipes and Bags (+ACL)

- manage recipes and bags
- manage the acl for them
- manage available plugins
- provide acl assertion checks for services to use

### Router and Transport

- Maps route definitions into service handlers
- HTTP, Websockets
