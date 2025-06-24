We need a way to add hooks at most significant points of the process. Maybe all code should just be hooks. Plugins need to be able to hook in and change what they need. I'm still trying to figure out how to put all the pieces together. 

I want routes to call the register function, rather than being called by setup code. But then I have to figure out where to put the register functions. 

Plugins need to hook into a whole bunch of points in the setup process, but they aren't bootstrapped until after the database is connected. 

I think the biggest problem is that I was originally planning to architect it with everything in the config file (similar to how a build system or server works), but it seems everyone wants to use the UI and store config in the database as much as possible, so I'll probably end up with something a lot more like WordPress. Once I rearrange everything more logically using imports, it should be fairly obvious how to use plugins. 

I probably need a startup state object, which basically has the site config and `rootRoute`. I also need to setup the CLI listen command [as outlined here](https://talk.tiddlywiki.org/t/mws-how-simple-can-we-make-the-cli-for-mws/12460). 

I guess this is actually a significant rewrite, so once I get some of the initial pieces done, it should be more obvious. 

-- Arlen22

## Retrospective - 2025-06-24

It was a significant rewrite. I separated MWS into three packages, one package for the events, one package for generic web server stuff, and one package for all the MWS logic. Getting config from the database is pretty simple. We do it on startup and then if a setting can be changed live, we just update the config property. For those settings, we store the value in the request state to make sure each request uses the same setting for the duration of the request.

The only downside is that we have to make sure we import all the files that use the server events, but that's a small price to pay for the much higher flexibility. I'm sure there's a lint rule we could create somehow, but I haven't gotten to that yet. 