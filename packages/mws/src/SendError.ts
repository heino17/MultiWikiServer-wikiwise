export class SendError {
  constructor(
    { apiText, htmlText, status }
      : { apiText: string, htmlText: string, status: number }
  ) {
    this.apiText = apiText
    this.htmlText = htmlText
    this.status = status
  }

  apiText
  htmlText
  status

  get html() {
    return (
      `
      <html>
      <body>
      <div>
      ${this.htmlText}
      </div>
      </body>
      </html>
      `
    )
  }



}

export class RecipeNotFound extends SendError {
  constructor(public recipeName: string) {
    super({
      status: 404,
      apiText: "recipe not found",
      htmlText: `Recipe ${recipeName} was not found.`
    })
  }
}

export class RecipeNoReadPermission extends SendError {
  constructor(public recipeName: string) {
    super({
      status: 403,
      apiText: "no read permission",
      htmlText: `You can not read from ${recipeName}.`
    })
  }
}

export class RecipeNoWritePermission extends SendError {
  constructor(public recipeName: string) {
    super({
      status: 403,
      apiText: "no write permission",
      htmlText: `You can not write to ${recipeName}.`
    })
  }
}

export class BagNotFound extends SendError {
  constructor(public bagName: string) {
    super({
      status: 404,
      apiText: "bag not found",
      htmlText: `Recipe ${bagName} was not found.`
    })
  }
}

export class BagNoReadPermission extends SendError {
  constructor(public bagName: string) {
    super({
      status: 403,
      apiText: "no read permission",
      htmlText: `You can not read from ${bagName}.`
    })
  }
}

export class BagNoWritePermission extends SendError {
  constructor(public bagName: string) {
    super({
      status: 403,
      apiText: "no write permission",
      htmlText: `You can not write to ${bagName}.`
    })
  }
}

export class PageNotAuthorizedForEndpoint extends SendError {
  constructor() {
    super({
      status: 403,
      apiText: "the page does not have permission to access this endpoint",
      htmlText: `The page does not have permission to access this endpoint.`
    })
  }
}