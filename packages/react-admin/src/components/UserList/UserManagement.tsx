import { useCallback } from 'react';
import { DataLoader, serverRequest, useIndexJson } from '../../helpers/utils';
import { Card, CardContent, CardHeader, Container, List, ListItemButton, ListItemText, Stack } from '@mui/material';
import { useCreateUserForm } from './useCreateUserForm';


interface User {
  user_id: string;
  username: string;
  email: string;
  created_at: string;
  last_login: string;
}

interface UserManagementResponse {
  "user-list": User[];
  "user-is-admin": boolean;
  "first-guest-user": boolean;
  username: string;
}

export const UserManagement = DataLoader(async () => {
  return await serverRequest.user_list(undefined);
}, (userList, refreshUsers, props) => {

  const [createUserMarkup, createUserUpdate] = useCreateUserForm(refreshUsers);

  return (
    <Container maxWidth="lg">
      <Stack direction="row" width="100%" spacing={2} marginBlockStart={4}>
        <Card sx={{ flexGrow: 1 }}>
          <CardContent>
            <List>
              {userList.map((user) => (
                <ListItemButton href={`admin/users/${user.user_id}`}>
                  <ListItemText
                    primary={<Stack direction="row" justifyContent="space-between"><span>{user.username}</span><span>Created: {user.created_at.slice(0, 10)}</span></Stack>}
                    secondary={<Stack direction="row" justifyContent="space-between"><span>{user.email}</span><span>Last Login: {user.last_login?.slice(0, 10) || 'Never'}</span></Stack>}
                  />
                </ListItemButton>
              ))}
            </List>
          </CardContent>
        </Card>
        <Card sx={{ width: "20rem" }}>
          <CardHeader title="Add New User" />
          <CardContent>
            {createUserMarkup}
          </CardContent>
        </Card>
      </Stack>
    </Container>
  )

});

export default UserManagement;