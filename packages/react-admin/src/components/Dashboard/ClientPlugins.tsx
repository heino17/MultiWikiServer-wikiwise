import { useCallback, useMemo, useState } from 'react';
import { useIndexJson } from '../../helpers';
import {
  Card, CardContent, List, ListItemButton,
  ListItemText, Stack, Collapse
} from "@mui/material";

import { useACLEditForm } from './ACLEdit';
import { useBagEditForm } from './BagEdit';



export function ClientPlugins() {
  const [{ hasBagAclAccess, ...indexJson }] = useIndexJson();

  const getOwner = useCallback((owner_id: string | null): string => {
    if (owner_id === null) return "System";
    return (indexJson.userListAdmin || indexJson.userListUser || [])
      .find(e => e.user_id === owner_id)?.username ?? "Unknown";
  }, [indexJson]);

  const [bagMarkup, bagSet] = useBagEditForm();
  const [aclMarkup, aclSet] = useACLEditForm();

  const tree = useMemo(() => {
    const tree: any = {};
    indexJson.clientPlugins.forEach(e => {
      const path = e.split("/");
      let parent = tree;
      path.forEach(f => {
        if (!parent[f]) parent[f] = {};
        parent = parent[f];
      });
    });
    console.log(tree);
    return tree;
  }, [indexJson.clientPlugins]);

  return <CardContent>
    <Stack direction="column" spacing={2}>
      <Card variant='outlined'>
        <CardContent>
          <h1>TiddlyWiki Plugins</h1>
          <List>
            {Object.keys(tree).map(e => (
              <TreeLevel folder={e} tree={tree[e]} />
            ))}
          </List>
          {bagMarkup}
          {aclMarkup}
        </CardContent>
        {/* <CardActions>
          <Button onClick={() => { bagSet(null); }}>Create new bag</Button>
        </CardActions> */}
      </Card>
    </Stack>
  </CardContent>;
}

function TreeLevel({ folder, tree }: { folder: string, tree: any }) {
  const [show, setShow] = useState(false);
  return <>
    <ListItemButton key={folder} onClick={() => { setShow(e => !e); }}>
      <ListItemText primary={folder} />
    </ListItemButton>
    <Collapse in={show} timeout="auto" unmountOnExit>
      <List sx={{ paddingLeft: "1rem" }} component="div" disablePadding>
        {Object.keys(tree).map(e => (
          <TreeLevel folder={e} tree={tree[e]} />
        ))}
      </List>
    </Collapse>
  </>
}