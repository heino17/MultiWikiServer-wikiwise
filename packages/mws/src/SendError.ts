export abstract class SendError
  <ReasonStr extends keyof ReasonSendErrorMap>
  extends Error {
  constructor({ details, status, reason }:
    {
      details: ReasonSendErrorMap[ReasonStr]["details"]
      status: number
      reason: string

    }) {
    super()
    this.status = status
    this.reason = reason
    this.details = details
    this.name = SendError.name
  }

  status
  reason
  details: ReasonSendErrorMap[ReasonStr]["details"]

  override get message() {
    return JSON.stringify({
      status: this.status,
      reason: this.reason,
      details: this.details
    })
  }

}



// TODO: Make it a type error to break this interface.
export interface ReasonSendErrorMap {
  "RECIPE_NOT_FOUND": {
    err: RecipeNotFound
    details: { recipeName: string }
  }
  "RECIPE_NO_READ_PERMISSION": {
    err: RecipeNoReadPermission
    details: { recipeName: string }
  }
  "RECIPE_NO_WRITE_PERMISSION": {
    err: RecipeNoWritePermission
    details: { recipeName: string }
  }
  "BAG_NOT_FOUND": {
    err: BagNotFound
    details: { bagName: string }
  }
  "BAG_NO_READ_PERMISSION": {
    err: BagNoReadPermission
    details: { bagName: string }
  }
  "BAG_NO_WRITE_PERMISSION": {
    err: BagNoWritePermission
    details: { bagName: string }
  }
  "PAGE_NOT_AUTHORIZED_FOR_ENDPOINT": {
    err: PageNotAuthorizedForEndpoint
    details: undefined
  }
}

export type xReason = keyof ReasonSendErrorMap

export class RecipeNotFound extends SendError<"RECIPE_NOT_FOUND"> {
  constructor(public recipeName: string) {
    super({
      details: { recipeName },
      status: 404,
      reason: "RECIPE_NOT_FOUND"
    })
  }
}

export class RecipeNoReadPermission extends SendError<"RECIPE_NO_READ_PERMISSION"> {
  constructor(public recipeName: string) {
    super({
      details: { recipeName },
      status: 403,
      reason: "RECIPE_NO_READ_PERMISSION"
    })
  }
}

export class RecipeNoWritePermission extends SendError<"RECIPE_NO_WRITE_PERMISSION"> {
  constructor(public recipeName: string) {
    super({
      details: { recipeName },
      status: 403,
      reason: "RECIPE_NO_WRITE_PERMISSION"
    })
  }
}

export class BagNotFound extends SendError<"BAG_NOT_FOUND"> {
  constructor(public bagName: string) {
    super({
      details: { bagName },
      status: 404,
      reason: "BAG_NOT_FOUND"
    })
  }
}

export class BagNoReadPermission extends SendError<"BAG_NO_READ_PERMISSION"> {
  constructor(public bagName: string) {
    super({
      details: { bagName },
      status: 403,
      reason: "BAG_NO_READ_PERMISSION"
    })
  }
}

export class BagNoWritePermission extends SendError<"BAG_NO_WRITE_PERMISSION"> {
  constructor(public bagName: string) {
    super({
      details: { bagName },
      status: 403,
      reason: "BAG_NO_WRITE_PERMISSION"
    })
  }
}

export class PageNotAuthorizedForEndpoint extends SendError<"PAGE_NOT_AUTHORIZED_FOR_ENDPOINT"> {
  constructor() {
    super({
      details: undefined,
      status: 403,
      reason: "PAGE_NOT_AUTHORIZED_FOR_ENDPOINT"
    })
  }
}