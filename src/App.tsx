import * as React from "react";
import "./App.css";

const redirectUrl = (url: string): string | null => {
  const regex = /[?&]([^=#]+)=([^&#]*)/g;
  let params: Record<string, string> = {};
  let match: RegExpExecArray | null;

  while ((match = regex.exec(url))) {
    params[match[1]] = match[2];
  }

  if (params.redirect) {
    return decodeURIComponent(params.redirect);
  }

  return null;
};

function App() {
  // Once Okta login is successful, the user will land on this page with a query
  // param set for further redirection. We detect it here and redirect the user
  // to it.
  const url = redirectUrl(window.location.href);
  if (url) {
    window.location.replace(url);
  }

  return (
    <div className="App">
      <header className="App-header">
        <p>Sanity Okta Saml SSO example</p>
        <a
          className="App-Link"
          href={`/.netlify/functions/auth/saml/login?host=${window.location.origin}`}
        >
          Login with Okta
        </a>
      </header>
    </div>
  );
}

export default App;
