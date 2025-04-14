import React, { useCallback, useState } from 'react';
import { EventEmitter, FormDialogEvents, IndexJson, MissingFavicon, useIndexJson } from '../../helpers';
import {
  Avatar, Button, Card, CardActions, CardContent, IconButton, Link, List, ListItem, ListItemAvatar, ListItemButton,
  ListItemText, Stack
} from "@mui/material";
import ACLIcon from '@mui/icons-material/AdminPanelSettings';
import EditIcon from '@mui/icons-material/Edit';
import ListItemIcon from '@mui/material/ListItemIcon';
import Collapse from '@mui/material/Collapse';
import ExpandLess from '@mui/icons-material/ExpandLess';
import ExpandMore from '@mui/icons-material/ExpandMore';
import WithACL from '@mui/icons-material/GppGood';
import WithoutACL from '@mui/icons-material/GppBadOutlined';
import { useEventEmitter } from '../../helpers';
import { RecipeEdit, RecipeEditEvents } from './RecipeEdit';
import { BagEdit, BagEditEvents } from './BagEdit';
import { EntityACL, useACLEditForm, } from './ACLEdit';

export const Dashboard = () => {

  const [{ getBag, getBagName, getBagDesc, hasBagAclAccess, hasRecipeAclAccess, ...indexJson }, refresh] = useIndexJson();

  const [showSystem, setShowSystem] = useState(false);

  const getOwner = useCallback((owner_id: number | null): string => {
    if (owner_id === null) return "System";
    return (indexJson.userListAdmin || indexJson.userListUser || [])
      .find(e => e.user_id === owner_id)?.username ?? "Unknown";
  }, [indexJson]);

  // Filter system bags based on showSystem state
  const normalBags = indexJson.bagList.filter(bag => !bag.is_plugin);
  const pluginBags = indexJson.bagList.filter(bag => bag.is_plugin);

  const handleShowSystemChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newShowSystem = e.target.checked;
    setShowSystem(newShowSystem);


    // Optionally persist the preference
    // nothing is reading this right now so just disable it
    // try {
    //   const url = new URL(window.location.href);
    //   url.searchParams.set('show_system', newShowSystem ? 'on' : 'off');
    //   window.history.replaceState({}, '', url.toString());
    // } catch (error) {
    //   console.error('Error updating URL:', error);
    // }
  };
  const recipeEditEvents = useEventEmitter<RecipeEditEvents>();
  const bagEditEvents = useEventEmitter<BagEditEvents>();
  const { events: aclEditEvents, markup: aclEditMarkup } = useACLEditForm();

  const [openRecipeItems, setOpenRecipeItems] = useState<string | null>(null);

  return (
    <CardContent>
      <RecipeEdit events={recipeEditEvents} />
      <BagEdit events={bagEditEvents} />
      {aclEditMarkup}
      <Stack direction="column" spacing={2}>
        <Card variant='outlined'>
          <CardContent>
            <h1>Recipes</h1>
            <List>
              {indexJson.recipeList.map((recipe) => (<>

                <ListItemButton key={recipe.recipe_name} disableRipple>
                  <ListItemAvatar>
                    <Avatar src={`/recipes/${encodeURIComponent(recipe.recipe_name)}/tiddlers/%24%3A%2Ffavicon.ico`}>
                      <MissingFavicon />
                    </Avatar>
                  </ListItemAvatar>
                  <ListItemText
                    primary={<>
                      <Link href={`/wiki/${encodeURIComponent(recipe.recipe_name)}`}>{recipe.recipe_name}</Link>
                      {recipe.owner_id && <span> (by {getOwner(recipe.owner_id)})</span>}
                    </>}
                    secondary={recipe.description}
                  />
                  <Stack direction="row" spacing={1}>
                    <IconButton
                      edge="end"
                      aria-label="edit recipe"
                      href=""
                      onClick={() => {
                        recipeEditEvents.emit({ type: "open", value: recipe });
                      }}
                    >
                      <EditIcon />
                    </IconButton>
                    {hasRecipeAclAccess(recipe) && (
                      <IconButton
                        edge="end"
                        aria-label="open acl"
                        onClick={() => {
                          aclEditEvents.emit({
                            type: "open",
                            value: {
                              type: "recipe",
                              id: recipe.recipe_id,
                              name: recipe.recipe_name,
                              description: recipe.description,
                              owner_id: recipe.owner_id,
                              acl: recipe.acl
                            }
                          });
                        }}
                      >
                        <ACLIcon />
                      </IconButton>
                    )}
                    <IconButton
                      edge="end"
                      aria-label="show bags"
                      onClick={() => {
                        setOpenRecipeItems(recipe.recipe_name === openRecipeItems ? null : recipe.recipe_name)
                      }}
                    >
                      {openRecipeItems === recipe.recipe_name ? <ExpandLess /> : <ExpandMore />}
                    </IconButton>
                  </Stack>
                </ListItemButton>
                <Collapse in={openRecipeItems === recipe.recipe_name} timeout="auto" unmountOnExit>
                  <List sx={{ pl: "4.25rem" }} component="div" disablePadding>

                    {recipe.recipe_bags.map(bag => (
                      <ListItem key={getBagName(bag.bag_id)}>
                        <ListItemAvatar>
                          <Avatar src={`/bags/${encodeURIComponent(getBagName(bag.bag_id)!)}/tiddlers/%24%3A%2Ffavicon.ico`}>
                            <MissingFavicon />
                          </Avatar>
                        </ListItemAvatar>
                        <ListItemIcon>
                          {bag.with_acl ? <WithACL /> : <WithoutACL />}
                        </ListItemIcon>
                        <ListItemText
                          primary={<>
                            {getBagName(bag.bag_id)}
                            {getBag(bag.bag_id)?.owner_id && <span> (by {getBag(bag.bag_id)!.owner_id})</span>}
                          </>}
                          secondary={getBagDesc(bag.bag_id)} />
                      </ListItem>
                    ))}

                  </List>
                </Collapse>

              </>))}
            </List>



          </CardContent>
          <CardActions>
            <Button onClick={() => {
              recipeEditEvents.emit({ type: "open", value: null });
            }}>Create new recipe</Button>
          </CardActions>
        </Card>


        {renderBags({
          title: "Bags",
          filteredBags: normalBags,
          bagEditEvents,
          hasBagAclAccess,
          aclEditEvents,
          getOwner
        })}

        {renderBags({
          title: "Plugins",
          filteredBags: pluginBags,
          bagEditEvents,
          aclEditEvents,
          getOwner
        })}

      </Stack>
    </CardContent >
  );
};

function renderBags({ title, filteredBags, bagEditEvents, hasBagAclAccess, aclEditEvents, getOwner }: {
  filteredBags: IndexJson["bagList"][number][];
  bagEditEvents: EventEmitter<BagEditEvents>;
  hasBagAclAccess?: (bag: IndexJson["bagList"][number]) => boolean;
  aclEditEvents: EventEmitter<FormDialogEvents<EntityACL>>;
  title: string;
  getOwner: (owner_id: number | null) => string;
}) {
  return <Card variant='outlined'>
    <CardContent>
      <h1>{title}</h1>
      <List>
        {filteredBags.map(bag => (
          <ListItemButton key={bag.bag_name} disableRipple>
            <ListItemAvatar>
              <Avatar src={`/bags/${encodeURIComponent(bag.bag_name)}/tiddlers/%24%3A%2Ffavicon.ico`}>
                <MissingFavicon />
              </Avatar>
            </ListItemAvatar>
            <ListItemText
              primary={<>
                {bag.bag_name}
                {bag.owner_id && <span> (by {getOwner(bag.owner_id)})</span>}
              </>}
              secondary={bag.description} />
            <Stack direction="row" spacing={1}>
              <IconButton
                edge="end"
                aria-label="edit"
                href=""
                onClick={(event) => {
                  bagEditEvents.emit({ type: "open", value: bag });
                }}
              >
                <EditIcon />
              </IconButton>
              {hasBagAclAccess?.(bag) && (
                <IconButton
                  edge="end"
                  aria-label="open acl"
                  onClick={() => {
                    aclEditEvents.emit({
                      type: "open",
                      value: {
                        type: "bag",
                        id: bag.bag_id,
                        name: bag.bag_name,
                        description: bag.description,
                        owner_id: bag.owner_id,
                        acl: bag.acl
                      }
                    });
                  }}
                >
                  <ACLIcon />
                </IconButton>
              )}
            </Stack>
          </ListItemButton>
        ))}
      </List>
    </CardContent>
    <CardActions>
      <Button onClick={() => {
        bagEditEvents.emit({ type: "open", value: null });
      }}>Create new bag</Button>
    </CardActions>
  </Card>;
}

