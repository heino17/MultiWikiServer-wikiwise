
import { ReactNode, useState } from 'react';
import Header from './Header';

import { Dashboard } from '../Dashboard/Dashboard';
import UserManagement from '../UserList/UserManagement';
import ManageUser from '../UserEdit/ManageUser';
import { useIndexJson } from '../../helpers/utils';
import { UsersScreen } from '../Users';


export const Frame = (props: {}) => {

  const [indexJson, refresh] = useIndexJson();

  const username = indexJson?.username;
  const userIsAdmin = indexJson?.isAdmin || false;
  const userIsLoggedIn = !!indexJson.isLoggedIn;
  const user = indexJson;

  const pages: [RegExp, (args: string[]) => ReactNode, string][] = [
    [/^\/$/, () => <Dashboard />, "Wikis Available Here"],
    [/^\/admin\/users\/?$/, () => <UserManagement />, "User Management"],
    [/^\/admin\/users\/(\d+)$/, ([, user_id]) => <ManageUser userID={user_id} />, "Manage User"],
    [/^\/admin\/roles$/, () => <UsersScreen />, "Roles"],
  ];

  const matches = pages.map(([re]) => re.exec(location.pathname));
  const index = matches.findIndex(m => m !== null);
  const page = index > -1 && pages[index][1](matches[index]!) || null;

  return (
    <>
      <Header
        pageTitle={page ? pages[index][2] : "TiddlyWiki"}
        username={username}
        userIsAdmin={userIsAdmin}
        userIsLoggedIn={userIsLoggedIn}
        userId={user?.user_id}
      />

      {/* {firstGuestUser && (
        <div className="mws-security-warning">
          <div className="mws-security-warning-content">
            <div className="mws-security-warning-icon">⚠️</div>
            <div className="mws-security-warning-text">
              <strong>Warning:</strong> TiddlyWiki is currently running in anonymous access mode which allows anyone with access to the server to read and modify data.
            </div>
            <div className="mws-security-warning-action">
              <a href="/admin/users" className="mws-security-warning-button">Add Admin Account</a>
            </div>
          </div>
        </div>
      )} */}

      {page ?? <div className="mws-error">Page not found</div>}
    </>
  )
};


