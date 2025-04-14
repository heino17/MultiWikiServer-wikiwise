import React, { PropsWithChildren, useCallback, useMemo } from 'react';
import { IndexJson, ok, Refresher, serverRequest, useIndexJson } from '../../helpers';
import {
  Autocomplete, Checkbox, DialogContent, DialogTitle, FormControlLabel, IconButton, Stack, TextField,
  useMediaQuery, useTheme

} from "@mui/material";
import MenuItem from '@mui/material/MenuItem';
import WithACL from '@mui/icons-material/GppGood';
import WithoutACL from '@mui/icons-material/GppBadOutlined';
import Add from '@mui/icons-material/Add';
import Remove from '@mui/icons-material/Remove';
import ArrowUpward from '@mui/icons-material/ArrowUpward';
import ArrowDownward from '@mui/icons-material/ArrowDownward';


import * as forms from "angular-forms-only";
import { EventEmitter, FormDialog, FormDialogEvents, FormDialogSubmitButton, useFormDialogForm, useObservable } from '../../helpers';
import { onChange, OwnerSelection, sortBagNames } from './Shared';


export interface Recipe {
  recipe_name: string;
  description: string;
  bag_names: { bag_name: string, with_acl: boolean }[];
  owner_id?: number | null;
}

const handleRecipeSubmit = ({ recipeForm, isAdmin, isCreate, globalRefresh }: {
  recipeForm: ReturnType<typeof RecipeForm>,
  isCreate: boolean,
  isAdmin: boolean,
  globalRefresh: Refresher<IndexJson["recipeList"][number]>
}) => async () => {

  const formData = recipeForm.value;
  console.log(formData, isCreate);

  if (!isAdmin) formData.owner_id = undefined;
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
  await globalRefresh();
  return `Recipe ${isCreate ? "created" : "updated"} successfully.`;
};

const RecipeForm = (
  value: IndexJson["recipeList"][number] | null,
  indexJson: IndexJson,
  disableOwnerID: boolean
) => {
  const form = new forms.FormGroup({
    recipe_name: new forms.FormControl(value?.recipe_name ?? "", { nonNullable: true, validators: [forms.Validators.required] }),
    description: new forms.FormControl(value?.description ?? "", { nonNullable: true, validators: [forms.Validators.required] }),
    owner_id: new forms.FormControl<number | null>(value?.owner_id ?? null, { nonNullable: true }),
    bag_names: new forms.FormArray<ReturnType<typeof RecipeBagRow>>(!value ? [] : value.recipe_bags.map(rb => {
      const bag = indexJson.getBag(rb.bag_id);
      return RecipeBagRow({ bag_name: bag?.bag_name ?? "", with_acl: rb.with_acl });
    }), { validators: [forms.Validators.required] }),
  });
  if (disableOwnerID) form.controls.owner_id.disable();
  if (value) form.controls.recipe_name.disable();
  return form;
};
interface RecipeBagRow {
  bag_name: string;
  with_acl: boolean;
}
const RecipeBagRow = (value: RecipeBagRow) => new forms.FormGroup({
  bag_name: new forms.FormControl(value.bag_name, { nonNullable: true, validators: [forms.Validators.required] }),
  with_acl: new forms.FormControl(value.with_acl, { nonNullable: true }),
});

function useRecipeEditContext() {
  return useFormDialogForm<IndexJson["recipeList"][number], ReturnType<typeof RecipeForm>>();
}

export type RecipeEditEvents = FormDialogEvents<IndexJson["recipeList"][number]>;

export function RecipeEdit({ events }: PropsWithChildren<{
  events: EventEmitter<RecipeEditEvents>
}>) {
  const [indexJson] = useIndexJson();
  const { isAdmin = false } = indexJson;

  const createForm = useCallback(
    (value: IndexJson["recipeList"][number] | null) =>
      RecipeForm(value, indexJson, !isAdmin),
    [indexJson, isAdmin]);

  return <FormDialog
    events={events}
    createForm={createForm}
    children={<RecipeFormComponent />}
  />;
}

function RecipeFormComponent() {
  const theme = useTheme();
  const [indexJson, globalRefresh] = useIndexJson();
  const { isAdmin = false } = indexJson;
  const { form: recipeForm, value, onRefresh } = useRecipeEditContext();
  const isCreate = value === null;

  useObservable(recipeForm.valueChanges);

  return (<>
    <DialogTitle>
      {isCreate ? "Create new recipe" : "Update recipe"}
    </DialogTitle>
    <DialogContent>
      {recipeForm && <Stack direction="column" spacing={2} alignItems="stretch" width="100%" paddingBlock={2}>
        <TextField
          label="Recipe Name"
          value={recipeForm.controls.recipe_name.value}
          onChange={onChange(recipeForm.controls.recipe_name)}
          disabled={recipeForm.controls.recipe_name.disabled}
          helperText={recipeForm.controls.recipe_name.disabled && "Recipe name cannot be changed."}
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
              recipeForm.controls.bag_names.markAsDirty();
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
              recipeForm.controls.bag_names.markAsDirty();
            } : undefined}
            onMoveDown={index < recipeForm.controls.bag_names.length - 1 ? () => {
              recipeForm.controls.bag_names.removeAt(index);
              recipeForm.controls.bag_names.insert(index + 1, bagRow);
              recipeForm.controls.bag_names.markAsDirty();
            } : undefined}
            onRemove={recipeForm.controls.bag_names.length > 1 ? () => {
              recipeForm.controls.bag_names.removeAt(index);
              recipeForm.controls.bag_names.markAsDirty();
            } : undefined} />
        ))}
        <FormDialogSubmitButton
          onSubmit={async () => {
            const formData = recipeForm.value;
            console.log(formData, isCreate);

            if (!isAdmin) formData.owner_id = undefined;
            else if (formData.owner_id === 0) formData.owner_id = null;

            if (formData.bag_names?.length === 0) throw "Recipe must have at least one bag.";
            if (recipeForm.invalid) { console.log(recipeForm.errors); throw recipeForm.errors; }

            const recipe_name = isCreate ? formData.recipe_name : value.recipe_name;
            ok(recipe_name);
            ok(formData.description);
            ok(formData.bag_names);

            const { recipe_id } = await serverRequest.recipe_upsert({
              recipe_name,
              description: formData.description,
              owner_id: formData.owner_id,
              bag_names: formData.bag_names.map(({ bag_name, with_acl = false }) =>
                (ok(bag_name), { bag_name, with_acl })
              ),
              isCreate,
            });

            const newJson = await globalRefresh();
            const newRecipe = newJson.recipeList.find(e => e.recipe_id === recipe_id);
            if (newRecipe) onRefresh(newRecipe);
            return `Recipe ${isCreate ? "created" : "updated"} successfully. `
              + `${newRecipe ? "Refreshed." : "Refresh to see changes."}`;
          }}
        />
      </Stack >}
    </DialogContent>
  </>)
}

function RecipeBagRowComponent({ bag_names, bagRow, onMoveDown, onMoveUp, onRemove }: {
  bag_names: string[],
  bagRow: ReturnType<typeof RecipeBagRow>,
  onMoveUp: (() => void) | undefined,
  onMoveDown: (() => void) | undefined
  onRemove: (() => void) | undefined
}) {
  useObservable(bagRow.valueChanges);
  const theme = useTheme();
  const doubleRow = useMediaQuery(theme.breakpoints.down('sm'));
  return (
    <Stack direction={doubleRow ? "column" : "row"} spacing={0}>
      <Autocomplete
        sx={{ flexGrow: 1 }}
        options={bag_names.sort(sortBagNames)}
        renderInput={(params) => <TextField error={!bagRow.value.bag_name} required {...params} label="Bag Name" />}
        value={bagRow.value.bag_name}
        onChange={(event, bag_name) => {
          bagRow.controls.bag_name.setValue(bag_name ?? "");
          bagRow.controls.bag_name.markAsDirty();
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
            bagRow.controls.with_acl.markAsDirty();
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
  );
}





