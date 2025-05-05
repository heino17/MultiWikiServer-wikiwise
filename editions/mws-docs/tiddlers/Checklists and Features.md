## ACL
 
- Verify that anonymous users only have the access defined by allowAnon.
  - No access to owned bags.
  - No access to bags with ACL defined.
- Verify that logged in users only have the access expected
  - No access to bags owned by other users.
  - Unless they are in the ACL for the bag.
  - No more access than what is granted by the ACL.
- Verify that all admin permissions are based on the admin role, not the first user.
- Verify that admin's cannot remove the admin role from themselves. 

## Recipes

- 