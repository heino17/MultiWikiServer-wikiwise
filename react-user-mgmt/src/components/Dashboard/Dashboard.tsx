import React, { useState, Dispatch, SetStateAction, useId, PropsWithChildren } from 'react';
import { ButtonAwait, IndexJson, serverRequest, useIndexJson } from '../../helpers/utils';
import { Alert, Autocomplete, Avatar, Button, ButtonProps, Card, CardActions, CardContent, Checkbox, Dialog, DialogContent, DialogTitle, FormControl, FormControlLabel, IconButton, InputLabel, Link, List, ListItem, ListItemAvatar, ListItemButton, ListItemText, OutlinedInput, Select, SelectChangeEvent, Stack, TextField, useMediaQuery, useTheme } from "@mui/material";
// import LockIcon from '@mui/icons-material/Lock';
// import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import MenuItem from '@mui/material/MenuItem';
import ACLIcon from '@mui/icons-material/AdminPanelSettings';
import EditIcon from '@mui/icons-material/Edit';
import ListSubheader from '@mui/material/ListSubheader';
import ListItemIcon from '@mui/material/ListItemIcon';
import Collapse from '@mui/material/Collapse';
import InboxIcon from '@mui/icons-material/MoveToInbox';
import DraftsIcon from '@mui/icons-material/Drafts';
import SendIcon from '@mui/icons-material/Send';
import ExpandLess from '@mui/icons-material/ExpandLess';
import ExpandMore from '@mui/icons-material/ExpandMore';
import StarBorder from '@mui/icons-material/StarBorder';
import WithACL from '@mui/icons-material/GppGood';
import WithoutACL from '@mui/icons-material/GppBadOutlined';
import Add from '@mui/icons-material/Add';
import Remove from '@mui/icons-material/Remove';
import ArrowUpward from '@mui/icons-material/ArrowUpward';
import ArrowDownward from '@mui/icons-material/ArrowDownward';

import SvgIcon from '@mui/material/SvgIcon';

import * as forms from "@angular/forms";
import { useObservable } from '../../helpers';

function ok(value: any): asserts value {
  if (value === null || value === undefined) throw new Error("Value is null or undefined");
  return value;
}


function MissingFavicon() {
  return <SvgIcon>
    <svg xmlns="http://www.w3.org/2000/svg" width="680" height="317pt" viewBox="34 107 510 317">
      <path d="m204.10294 372.67294 2.81039.8291c3.53151-1.58007 10.63031.86197 14.3959 2.05591-6.934-7.68695-17.38058-18.97509-24.90698-26.09145-2.4704-8.61546-1.41632-17.2848-.88481-26.0799l.10661-.7276c-2.96672 7.0407-6.73159 13.8847-8.75512 21.29577-2.36798 9.99817 10.5243 20.78568 15.5234 26.96817Zm214.89999 42.28504c-19.34998-.54698-27.86099-.49994-37.71558-16.70502l-7.68051.22004c-8.93988-.397-5.2142-.21705-11.1784-.51399-9.9719-.38803-8.37448-9.86297-10.12879-14.86898-2.8063-16.99305 3.71359-34.07392 3.50791-51.07032-.07282-6.03332-8.61032-27.38909-11.6604-35.02423-9.56162 1.80024-19.17511 2.14347-28.8754 2.62683-22.35922-.05477-44.5668-2.79281-66.61382-6.26983-4.29641 17.74804-17.06701 42.58935-6.5111 60.62682 12.81291 18.65766 21.80439 23.82667 35.7414 24.95164 13.93686 1.12406 17.0839 16.85904 13.71207 22.47903-2.98447 3.88403-8.22986 4.58905-12.68646 5.53003l-8.9144.41898c-7.01489-.23599-13.28491-2.12998-19.53552-5.051-10.43848-5.82696-21.2195-17.94095-29.22959-26.63797 1.86481 3.47299 2.97712 10.25293 1.28571 13.40802-4.7359 6.70896-25.21872 6.66797-34.59912 2.49897-10.65598-4.73502-36.40497-37.98197-40.386-62.88245 10.591-20.02872 26.02-37.47495 33.826-59.28323-17.015-10.85694-26.128-28.53113-24.94499-48.55152l.427-2.3175c-16.74199 3.13418-8.05998 1.96809-26.069976 3.33049-57.356004-.17549-107.796005-39.06484-79.393997-99.505786 1.846985-3.57904 3.603989-6.833004 6.735001-5.278994 2.512985 1.24695 2.152008 6.24898.887985 11.79598-16.234985 72.21878 63.111997 72.77153 111.887997 59.40782 4.84098-1.3266 14.46898-10.2612 21.13848-13.22311 10.9019-4.84113 22.7348-6.8053 34.47801-8.22059 29.20767-3.32814 64.31171 12.05838 82.14798 12.56079 17.83648.50239 43.20953-4.27082 58.785-3.26582 11.30133.51708 22.39853 2.55699 33.30252 5.46282 7.05802-34.3909 7.55701-59.737904 24.289-65.6059 9.82001 1.550995 17.38696 14.93298 22.98801 22.08301l.02298-.00403c11.40697-.45001 22.26203 2.44403 33.05499 5.65599 19.54004-2.772964 35.93702-13.74597 53.193-22.28198-.05396.268995-.33594.35998-.50397.54098-16.98199 13.73401-19.35405 36.95803-17.35602 58.43425.74304 11.14415-2.406 23.24344-6.29895 34.65357-7.28503 18.5899-21.35406 38.18498-37.68304 37.17997-6.17298-.19526-9.75901-3.69059-14.34699-7.4223-.89001 7.55863-4.388 14.30321-7.76001 20.98812-7.78698 14.82183-28.13598 21.35339-46.97802 37.18005-18.84076 15.8269 6.02902 72.35141 12.05902 82.65039 6.02902 10.29996 22.85998 14.06796 16.32901 23.36392-1.99799 3.07004-5.05301 4.16806-8.31803 5.35904Z" />
    </svg>
  </SvgIcon>
}



interface DashboardProps {
  username: string;
  userIsAdmin: boolean;
  userIsLoggedIn: boolean;
  firstGuestUser: boolean;
  userId?: string;
  initialShowSystem: boolean;
  initialShowAnonConfig: boolean;
  initialAllowReads: boolean;
  initialAllowWrites: boolean;
}

interface Recipe {
  recipe_name: string;
  description: string;
  bag_names: { bag_name: string, with_acl: boolean }[];
  owner_id?: number | null;
}

interface Bag {
  bag_name: string;
  description: string;
  owner_id?: number | null;
}

const RecipeForm = (value: Recipe, disableOwnerID: boolean) => {
  const form = new forms.FormGroup({
    recipe_name: new forms.FormControl(value.recipe_name, { nonNullable: true, validators: [forms.Validators.required] }),
    description: new forms.FormControl(value.description, { nonNullable: true, validators: [forms.Validators.required] }),
    owner_id: new forms.FormControl<number>(value.owner_id ?? 0),
    bag_names: new forms.FormArray<ReturnType<typeof RecipeBagRow>>(value.bag_names.map(RecipeBagRow), {
      validators: [forms.Validators.required]
    }),
  });
  if (disableOwnerID) form.controls.owner_id.disable();
  return form;
}
const RecipeBagRow = (value: Recipe["bag_names"][number]) => new forms.FormGroup({
  bag_name: new forms.FormControl(value.bag_name, { nonNullable: true, validators: [forms.Validators.required] }),
  with_acl: new forms.FormControl(value.with_acl, { nonNullable: true }),
});

const BagForm = (value: Bag, disableOwnerID: boolean) => {
  const form = new forms.FormGroup({
    bag_name: new forms.FormControl(value.bag_name, {
      nonNullable: true, validators: [forms.Validators.required]
    }),
    description: new forms.FormControl(value.description, {
      nonNullable: true, validators: [forms.Validators.required]
    }),
    owner_id: new forms.FormControl<number>(value.owner_id ?? 0),
  });
  if (disableOwnerID) form.controls.owner_id.disable();
  return form;
}
export const Dashboard = () => {

  const [{ getBag, getBagName, getBagDesc, hasBagAclAccess, hasRecipeAclAccess, ...indexJson }, refresh] = useIndexJson();

  const isAdmin = indexJson.isAdmin;

  const [showSystem, setShowSystem] = useState(false);

  // Filter system bags based on showSystem state
  const filteredBags = showSystem
    ? indexJson.bagList
    : indexJson.bagList.filter(bag => !bag.bag_name.startsWith("$:/"));

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



  const [openRecipeItems, setOpenRecipeItems] = useState<string | null>(null);
  const [showRecipeDialog, setShowRecipeDialog] = useState(false);
  const [recipeCreate, setRecipeCreate] = useState(false);
  const [recipeTitle, setRecipeTitle] = useState("");
  const [recipeForm, setRecipeForm] = useState<ReturnType<typeof RecipeForm> | null>(null);
  // this triggers a render whenever the valueChanges event emits a new value
  // useObservable(recipeForm?.valueChanges);

  const [showBagDialog, setShowBagDialog] = useState(false);
  const [bagCreate, setBagCreate] = useState(false);
  const [bagForm, setBagForm] = useState<ReturnType<typeof BagForm> | null>(null);
  const [bagTitle, setBagTitle] = useState("");
  // this triggers a render whenever the valueChanges event emits a new value
  // useObservable(bagForm?.valueChanges);

  return (
    <CardContent>
      <Stack direction="column" spacing={2}>


        <Card variant='outlined'>
          <CardContent>
            <h1>Recipes</h1>
            <List>
              {indexJson.recipeList.map((recipe) => (<>

                <ListItem key={recipe.recipe_name}>
                  <ListItemAvatar>
                    <Avatar src={`/recipes/${encodeURIComponent(recipe.recipe_name)}/tiddlers/%24%3A%2Ffavicon.ico`}>
                      <MissingFavicon />
                    </Avatar>
                  </ListItemAvatar>

                  <ListItemText
                    primary={<>
                      <Link href={`/wiki/${encodeURIComponent(recipe.recipe_name)}`}>{recipe.recipe_name}</Link>
                      {recipe.owner && <span> (by {recipe.owner.username})</span>}
                    </>}
                    secondary={recipe.description}
                  />

                  <IconButton
                    edge="end"
                    aria-label="edit recipe"
                    href=""
                    onClick={(event) => {
                      setShowRecipeDialog(true);
                      setRecipeTitle("Edit recipe");
                      setRecipeCreate(false);
                      setRecipeForm(RecipeForm({
                        recipe_name: recipe.recipe_name,
                        description: recipe.description,
                        owner_id: recipe.owner_id,
                        bag_names: recipe.recipe_bags.map(bag => ({
                          bag_name: getBagName(bag.bag_id) ?? "",
                          with_acl: bag.with_acl
                        }))
                      }, !isAdmin));
                    }}
                  >
                    <EditIcon />
                  </IconButton>
                  {hasRecipeAclAccess(recipe) && (
                    <IconButton
                      edge="end"
                      aria-label="open acl"
                      href={`/admin/acl/${recipe.recipe_name}`}
                    >
                      <ACLIcon />
                    </IconButton>
                  )}
                  <IconButton
                    edge="end"
                    aria-label="show bags"
                    onClick={() => { setOpenRecipeItems(recipe.recipe_name === openRecipeItems ? null : recipe.recipe_name) }}
                  >
                    {openRecipeItems === recipe.recipe_name ? <ExpandLess /> : <ExpandMore />}
                  </IconButton>
                </ListItem>
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
                            {getBag(bag.bag_id)?.owner && <span> (by {getBag(bag.bag_id)!.owner!.username})</span>}
                          </>}
                          secondary={getBagDesc(bag.bag_id)} />
                      </ListItem>
                    ))}

                  </List>
                </Collapse>

              </>))}
            </List>
            <Dialog open={!!recipeForm} onClose={() => { setRecipeForm(null); }} maxWidth="md" fullWidth>
              <DialogTitle>{recipeTitle}</DialogTitle>
              <DialogContent>
                {recipeForm && <RecipeFormComponent recipeForm={recipeForm} isCreate={recipeCreate} />}
              </DialogContent>
            </Dialog>

          </CardContent>
          <CardActions>
            <Button onClick={() => {
              setShowRecipeDialog(true);
              setRecipeTitle("Create new recipe");
              setRecipeCreate(true);
              setRecipeForm(RecipeForm({
                recipe_name: "",
                description: "",
                owner_id: null,
                bag_names: [{ bag_name: "", with_acl: false }]
              }, !isAdmin));
            }}>Create new recipe</Button>
          </CardActions>
        </Card>


        <Card variant='outlined'>
          <CardContent>
            <h1>Bags</h1>
            <List>
              {filteredBags.map(bag => (
                <ListItem key={bag.bag_name}>
                  <ListItemAvatar>
                    <Avatar src={`/bags/${encodeURIComponent(bag.bag_name)}/tiddlers/%24%3A%2Ffavicon.ico`} >
                      <MissingFavicon />
                    </Avatar>
                  </ListItemAvatar>
                  <ListItemText
                    primary={<>
                      {bag.bag_name}
                      {bag.owner && <span> (by {bag.owner.username})</span>}
                    </>}
                    secondary={bag.description} />
                  <IconButton
                    edge="end"
                    aria-label="delete"
                    href=""
                    onClick={(event) => {
                      setShowBagDialog(true);
                      setBagTitle("Edit bag");
                      setBagCreate(false);
                      setBagForm(BagForm({
                        bag_name: bag.bag_name,
                        description: bag.description,
                        owner_id: bag.owner_id
                      }, !isAdmin));
                    }}
                  >
                    <EditIcon />
                  </IconButton>
                </ListItem>
              ))}
            </List>
            <Dialog open={showBagDialog} onClose={() => { setShowBagDialog(false); }} maxWidth="md" fullWidth>
              <DialogTitle>{bagTitle}</DialogTitle>
              <DialogContent>
                {bagForm && <BagFormComponent bagForm={bagForm} isCreate={bagCreate} />}
              </DialogContent>
            </Dialog>
          </CardContent>
          <CardActions>
            <Button onClick={() => {
              setShowBagDialog(true);
              setBagTitle("Create new bag");
              setBagCreate(true);
              setBagForm(BagForm({
                bag_name: "",
                description: "",
                owner_id: null
              }, !isAdmin));
            }}>Create new bag</Button>
          </CardActions>
        </Card>

        <h1>Advanced</h1>

        <div id="checkboxForm">
          <input
            type="checkbox"
            id="chkShowSystem"
            name="show_system"
            value="on"
            checked={showSystem}
            onChange={handleShowSystemChange}
          />
          <label htmlFor="chkShowSystem">Show system bags</label>
        </div>
      </Stack>
    </CardContent >
  );
};

function onChange<T>(formControl: forms.FormControl<T>) {
  return (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement> | SelectChangeEvent<T>) =>
    formControl.setValue(event.target.value as T);
}
function RecipeFormComponent({ recipeForm, isCreate }: { recipeForm: ReturnType<typeof RecipeForm>, isCreate: boolean }) {
  const theme = useTheme();
  const [indexJson, globalRefresh] = useIndexJson();
  useObservable(recipeForm.valueChanges);

  const handleRecipeSubmit = async () => {
    const formData = recipeForm.value;
    console.log(formData, isCreate);

    if (!indexJson.isAdmin) formData.owner_id = undefined;
    else if (formData.owner_id === 0) formData.owner_id = null;
    if (formData.bag_names?.length === 0) throw "Recipe must have at least one bag.";
    if (recipeForm.invalid) { console.log(recipeForm.errors); throw recipeForm.errors; }

    ok(formData.recipe_name);
    ok(formData.description);
    ok(formData.bag_names);

    await serverRequest.recipe_upsert({
      recipe_name: formData.recipe_name,
      description: formData.description,
      owner_id: formData.owner_id,
      bag_names: formData.bag_names.map(({ bag_name, with_acl = false }) =>
        (ok(bag_name), { bag_name, with_acl })
      ),
      isCreate,
    });
    globalRefresh();
    return `Recipe ${isCreate ? "created" : "updated"} successfully.`;
  };
  const owner_html_id = useId();
  return <Stack direction="column" spacing={2} alignItems="stretch" width="100%" paddingBlock={2}>
    <TextField
      label="Recipe Name"
      value={recipeForm.controls.recipe_name.value}
      onChange={onChange(recipeForm.controls.recipe_name)}
    />
    <TextField
      label="Description"
      value={recipeForm.controls.description.value}
      onChange={onChange(recipeForm.controls.description)}
    />
    <OwnerSelection isCreate={isCreate} control={recipeForm.controls.owner_id} />
    <Stack direction="row" spacing={2} justifyContent="space-between">
      <h2>Bags</h2>
      <IconButton sx={{ color: theme.palette.primary.main }}
        onClick={() => {
          recipeForm.controls.bag_names.insert(0, RecipeBagRow({ bag_name: "", with_acl: false }));
        }}
      >
        <Add />
      </IconButton>
    </Stack>
    {recipeForm.controls.bag_names.controls.map((bagRow, index) => (
      <RecipeBagRowComponent
        key={JSON.stringify(bagRow.value.bag_name)}
        bagRow={bagRow}
        bag_names={indexJson.bagList.map(e => e.bag_name)}
        onMoveUp={index > 0 ? () => {
          recipeForm.controls.bag_names.removeAt(index);
          recipeForm.controls.bag_names.insert(index - 1, bagRow);
        } : undefined}
        onMoveDown={index < recipeForm.controls.bag_names.length - 1 ? () => {
          recipeForm.controls.bag_names.removeAt(index);
          recipeForm.controls.bag_names.insert(index + 1, bagRow);
        } : undefined}
        onRemove={recipeForm.controls.bag_names.length > 1 ? () => {
          recipeForm.controls.bag_names.removeAt(index);
        } : undefined} />
    ))}
    <SubmitButton form={recipeForm} onSubmit={handleRecipeSubmit} />
  </Stack >
}

const sortBagNames = (a: string, b: string) =>
  (+a.startsWith("$:/") - +b.startsWith("$:/"))
  || a.localeCompare(b);

export function RecipeBagRowComponent({ bag_names, bagRow, onMoveDown, onMoveUp, onRemove }: {
  bag_names: string[],
  bagRow: ReturnType<typeof RecipeBagRow>,
  // value: Partial<{ bag_name: string | null, with_acl: boolean }>,
  // setValue: Dispatch<SetStateAction<Partial<{ bag_name: string | null; with_acl: boolean }>>>,
  onMoveUp: (() => void) | undefined,
  onMoveDown: (() => void) | undefined
  onRemove: (() => void) | undefined
}) {
  useObservable(bagRow.valueChanges);
  const theme = useTheme();
  const doubleRow = useMediaQuery(theme.breakpoints.down('sm'));
  return <Stack direction={doubleRow ? "column" : "row"} spacing={0}>
    <Autocomplete
      sx={{ flexGrow: 1 }}
      options={bag_names.sort(sortBagNames)}
      renderInput={(params) => <TextField error={!bagRow.value.bag_name} required {...params} label="Bag Name" />}
      value={bagRow.value.bag_name}
      onChange={(event, bag_name) => {
        bagRow.controls.bag_name.setValue(bag_name ?? "");
      }}
    />
    <Stack direction="row" spacing={0}>
      <Checkbox
        disabled={bagRow.value.bag_name?.startsWith("$:/")}
        checkedIcon={<WithACL />}
        icon={<WithoutACL />}
        defaultChecked={!bagRow.value.bag_name?.startsWith("$:/")}
        color="primary"
        title="With ACL"
        value={bagRow.value.with_acl}
        onChange={(event, with_acl) => {
          console.log(with_acl);
          bagRow.controls.with_acl.setValue(with_acl);
        }}
      />
      <IconButton disabled={!onMoveUp} onClick={onMoveUp}>
        <ArrowUpward />
      </IconButton>
      <IconButton disabled={!onMoveDown} onClick={onMoveDown}>
        <ArrowDownward />
      </IconButton>
      <IconButton disabled={!onRemove} onClick={onRemove} sx={{ color: theme.palette.error.main }}>
        <Remove />
      </IconButton>
    </Stack>
  </Stack>
}

function BagFormComponent({ bagForm, isCreate }: { bagForm: ReturnType<typeof BagForm>, isCreate: boolean }) {
  const [indexJson, globalRefresh] = useIndexJson();

  const handleBagSubmit = async () => {
    const formData = bagForm.value;
    console.log(formData, isCreate);

    if (!indexJson.isAdmin) formData.owner_id = undefined;
    else if (formData.owner_id === 0) formData.owner_id = null;
    if (bagForm.invalid) { console.log(bagForm.errors); throw bagForm.errors; }
    ok(formData.bag_name);
    ok(formData.description);

    await serverRequest.bag_upsert({
      bag_name: formData.bag_name,
      description: formData.description,
      owner_id: formData.owner_id,
      isCreate,
    });

    globalRefresh();
    return `Bag ${isCreate ? "created" : "updated"} successfully.`;

  }
  return <Stack direction="column" spacing={2}>
    <TextField
      label="Bag Name"
      value={bagForm.controls.bag_name.value}
      onChange={onChange(bagForm.controls.bag_name)}
      disabled={bagForm.controls.bag_name.disabled}
    />
    <TextField
      label="Description"
      value={bagForm.controls.description.value}
      onChange={onChange(bagForm.controls.description)}
      disabled={bagForm.controls.description.disabled}
    />
    <OwnerSelection isCreate={isCreate} control={bagForm.controls.owner_id} />
    <SubmitButton form={bagForm} onSubmit={handleBagSubmit} />
  </Stack>
}

function OwnerSelection({ isCreate, control }: { isCreate: boolean; control: forms.FormControl<number | null>; }): React.ReactNode {
  const [indexJson] = useIndexJson();
  useObservable(control.valueChanges);
  if (!indexJson.isAdmin || !indexJson.userList) return null;
  if (isCreate) return (
    <FormControlLabel
      label="Admin option: Make yourself the owner."
      control={<Checkbox
        value={control.value}
        onChange={(event) => control.setValue(event.target.checked ? indexJson.user_id! : null)}
        disabled={control.disabled}
      />}
    />
  );
  return (
    <SelectField title="Owner" control={control}>
      <MenuItem value={0}>Site-wide</MenuItem>
      {indexJson.userList.map(user => (
        <MenuItem value={user.user_id}>{user.username}</MenuItem>
      ))}
    </SelectField>
  );

}

function SubmitButton({ form, onSubmit }: {
  /** 
   * A function which returns a string for the success message, or throws an error.
   * 
   * Uses error directly if it is a string, or error.message if available, or `${error}`.
   */
  onSubmit: () => Promise<string>
  /** Check this form for validity and disable the button if the form is not valid. */
  form?: forms.AbstractControl
}) {
  useObservable(form?.statusChanges);
  const [submitResult, setSubmitResult] = useState<{ ok: boolean, message: string } | null>(null);
  return <>
    <Stack direction="row" spacing={2}>
      <ButtonAwait disabled={form?.invalid || form?.disabled} variant="contained" onClick={async () => {
        setSubmitResult(null);
        const submitResult = await onSubmit().then(
          message => ({ ok: true, message }),
          error => ({ ok: false, message: typeof error === "string" ? error : `${error?.message ?? error}` })
        );
        setSubmitResult(submitResult);
      }}>Submit</ButtonAwait>
    </Stack>
    {submitResult && submitResult.ok === false && <Alert severity='error'>{submitResult.message}</Alert>}
    {submitResult && submitResult.ok === true && <Alert severity='success'>{submitResult.message}</Alert>}
  </>
}

export function SelectField({ title, children, control }: PropsWithChildren<{
  title: string,
  control: forms.FormControl<number | null>
}>) {
  const html_id = useId();
  useObservable(control.valueChanges);
  return <FormControl>
    <InputLabel id={html_id}>{title}</InputLabel>
    <Select<number>
      input={<OutlinedInput label={title} />}
      labelId={html_id}
      value={control.value ?? 0}
      onChange={onChange(control)}
      disabled={control.disabled}
    >
      {children}
    </Select>
  </FormControl>
}
