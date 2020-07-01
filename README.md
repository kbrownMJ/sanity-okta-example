# Sanity Okta SAML SSO example

## What it is

This is an example showing how you can log in users to Sanity using [Okta](https://okta.com) with SAML 2.0, and assign them to custom access control groups in Sanity depending on their group membership in Okta. This application is meant to be hosted on [Netlify](https://netlify.com), but you may of course modify it to work on any serverless hosting platform, or adapt it to run on your own infrastructure. In essence it is simply a Node.js Express app utilizing [passport](http://www.passportjs.org/) for the authentication flow, found in [src/lambda/auth.ts](src/lambda/auth.ts) and communication with Sanity happens in [src/sanitySession.ts ](src/sanitySession.ts ).

## Components

- A React SPA as a place to report any authentication failures or progress indicators while logging the user in (not strictly needed for just handling SSO and group management)
- Passport middleware to handle the Okta SAML flow
- Code to communicate with Sanity for creating sessions and access groups and group membership.

## How it works

After setting up an application on Okta and configuring your Sanity Studio with a custom login (instructions further down in this file), Okta will redirect to this application after login, where the following happens:

- Sync groups to Sanity. Example: If the user is a member of an `editors` group on Okta and this is a group unknown to Sanity, a new blank group will be created in your dataset.
- Sync group membership to Sanity. Any new group memberships will cause the users ID to be added to the corresponding Sanity groups `members` array. Conversely if the logged in user has been removed from a group in Okta, we make sure to remove the user ID from the corresponding Sanity groups `members` array.
- POST to https://projectId.api.sanity.io/v1/auth/thirdParty/session. This API call returns a session claim URL to which we redirect the user to have a cookie set, in effect creating the session to your Sanity project. We also supply the URL for the Studio in this call, so the session claim endpoint redirects the user to the Studio to complete the login flow.

## Requirements

SSO and custom access control on Sanity is an Enterprise tier feature. Get in touch with us if you are interested in upgrading your plan and would like to talk about your use case for this feature.

In order to create and mutate access groups, and to create thirdparty sessions you need a special token named "Create Session". If you have the SSO feature you can create this token on [https://manage.sanity.io](https://manage.sanity.io) under Settings, API, Tokens.

## Limitations

This application will create new groups it sees when a user logs in. These group will by default not have any grants. Therefore you will need to manage the `grants` array of these groups to ensure that the group corresponds to the permissions you would like to give to that group of user. Adding or changing the grants for a group works in the same way as creating them, using the `sanityClient` to change the documents. For more information on how the grants work, see the [access control documentation](https://www.sanity.io/docs/access-control)

Authentication failures or other errors are not currently handled.

## Setup

### Okta

Log into your Okta developer account and navigate to the application directory (I had to go to a user, and select add Application). Here you choose "Create New App". Select Web application and enable SAML 2.0.

<img width="1083" alt="Skjermbilde 2020-07-02 kl  12 59 53" src="https://user-images.githubusercontent.com/38528/86351121-0aabbc80-bc64-11ea-8c75-87b2a20cdcea.png">

On the next page you will set up the SAML Settings:

- Single sign on URL:

http://localhost:8888/.netlify/functions/auth/saml/callback

(If you are deploying this app to netlify you will use your netlify deploy host here instead of localhost:8888. You can change this later after testing locally.

- Audience URI (SP Entity ID)

Pick a string like `sanity-okta-sso`

- Application username

Can be set to Okta username.

- Attribute statements. Fill out as according to the screenshot. This provides us with the user and group information we need in the SAML response.

<img width="592" alt="samlsettings" src="https://user-images.githubusercontent.com/38528/86351290-4fcfee80-bc64-11ea-8e0f-6def80b1a51c.png">

Download the Okta certificate to your computer with the button on the right hand side.

On the next screen select

- I'm an Okta customer adding an internal app
- This is an internal app that we have created

After creating this app, to find the last bits of information you need, change the view to Classic UI by hovering over "Developer Console" at the top left of the page and navigate back to your app by going to Applications > Your app in the list -> "Sign On" and clicking the "View Setup Instructions" button.

<img width="606" alt="Skjermbilde 2020-07-02 kl  13 20 12" src="https://user-images.githubusercontent.com/38528/86354611-a2f87000-bc69-11ea-94ee-905ee7d7298a.png">

Save the values for

- Identity Provider Single Sign-On URL
- Identity Provider Issuer

Then go back and to the "General Settings" tab and scroll down to find the "App Embed Link". Save this value.

<img width="750" alt="appEmbedlink" src="https://user-images.githubusercontent.com/38528/86342219-98cd7600-bc57-11ea-8afb-83567abec56d.png">

And you are done with the setup on Okta. Futher actions here would be normal managing of users and their groups. Notice we have set a regex to avoid the Everyone group here, so it is not synced to Sanity. `everyone` is an internal Sanity group you cannot modify, and corresponds to the users added in the Sanity Identity Provider, so we just ignore it here.

### Netlify

Make sure you have the netlify CLI tool installed, and that you are logged in to your Netlify account.

- https://docs.netlify.com/cli/get-started/#installation

Run `netlify init` in the root of this folder to create a Netlify project for this app.

### Netlify environment variables

Visit [https://manage.sanity.io](https://manage.sanity.io) and obtain the following information for your Sanity project:

- Sanity projectId
- Sanity dataset name
- "Create Session" token (Under Settings, API, Tokens)
- Studio URL (If you are hosting on your own you probably already have this information elsewhere)

Then go to [https://app.netlify.com/](https://app.netlify.com/) and navigate to your new Netlify app. Under Site Settings, Build & Deploy, Environment add the following variables:

- SANITY_DATASET
- SANITY_PROJECT_ID
- SANITY_STUDIO_URL
  - This can be http://localhost:3333 if you are running the Studio locally for testing.
- SANITY_TOKEN

  - The "Create Session" token you created earlier

- OKTA_CERT
  - Here you will need to take the certificate you previously downloaded, then _replace the newlines with underscores_ (\*), since env variables do not support line breaks.
- OKTA_ENTRYPOINT
  - This is the "Identity Provider Single Sign-On URL" you got from Okta
- OKTA_ISSUER
  - This is the "Identity Provider Issuer" from Okta

### Studio config

Navigate to the Studio source code folder and change or create the file `config/@sanity/default-login.json` in your Studio project to contain the following. The `entries` array here are the different login methods you want to provide to your users. You can of course all additional entries here if you want.

The `url` property is the "App Embed Link" you saved from Okta developer admin previously. You may also provide an icon for this login by placing a png in the static folder of the studio and referring it with the `logo` property as in this example.

```javascript
{
  "providers": {
    "mode": "replace",
    "redirectOnSingle": false,
    "entries": [
      {
        "name": "Okta",
        "url": "https://dev-676158.okta.com/home/sanitydev676158_sanityssoexample_1/0oai344tegmOOUIuQ4x6/alni3597cojQLzeFJ4x6",
        "title": "Login with Okta SSO",
        "logo": "/static/okta-login.png"
      }
    ]
  }
}
```

### Running the example

First add any user(s) to the application on Okta so they can log in.

Run your Studio locally (if you are not testing this with a hosted Studio) with `sanity start` in that folder. Then in this folder run `netlify dev`. Now visiting your Studio you should be presented with 1 login option which is Okta. Click this will take you to Okta for login (if you are not already logged in), then you will be redirected to this application which handles the group management and session creating, and eventually you will be redirected to the Studio with a valid session. Notice that this won't automatically give you grants and permissions so you probably can't view or edit any documents at this time. See Limitations.

![SSO](https://user-images.githubusercontent.com/38528/86368959-1d32ef80-bc7e-11ea-9d46-d2bf4a84d721.gif)

### Deploying

To deploy this login flow you'll need to replace the configured URLs on Okta and Netlify from localhost:8888 to where this app deploys, typically a Netlify app url you can find on Netlify.com. The actualy deployment happens with `netlify deploy`.

## Possible improvements

Okta lets you set up an [event notification webhook](https://developer.okta.com/docs/concepts/event-hooks/). With this you can get notified when relevant events occur, (such as user added to or removed from the app, group membership changes) and then mutate the access control documents in your Sanity dataset accordingly, without waiting for the user to actually log in first.

<img width="758" alt="eventHookConfig" src="https://user-images.githubusercontent.com/38528/86334466-864e3f00-bc4d-11ea-8181-b91c6f3c9339.png">

Here is a sketch of an endpoint (added to src/lambda/auth.ts) that could handle this event hook.

```javascript
const verifyEventSource = (req, res, next) => {
  // Here you should verify that the posted event comes from Okta by inspecting
  // the authentication header you set up when configuring event hooks at Okta.
  next();
};

// An example of receiving Okta Event hooks.
// These can be used for syncing groups and user group membership
router.post(
  "/eventHandler",
  verifyEventSource,
  bodyParser.json(),
  (req, res) => {
    const payload = req.body;
    for (let event of payload.data.events) {
      switch (event.eventType) {
        case "application.user_membership.add":
          // User added to the App
          break;
        case "application.user_membership.remove":
          // User removed from the App
          // This would be a good place to also remove the user from Sanity. See https://www.sanity.io/docs/third-party-login#user-profiles-0f3ca7f937a3 for docs on deleting previously created SSO user profiles.
          break;
        case "group.user_membership.add":
          // User added to a group
          break;
        case "group.user_membership.remove":
          // User removed from a group
          break;
        default:
          // List of available events here
          // https://developer.okta.com/docs/reference/api/event-types/?q=event-hook-eligible
          break;
      }
    }
    // The reply to Okta should be 200/204
    res.sendStatus(204);
  }
);
```

## Documentation
[Sanity.io SSO](https://www.sanity.io/docs/third-party-login)

[Sanity.io access control](https://www.sanity.io/docs/access-control)
