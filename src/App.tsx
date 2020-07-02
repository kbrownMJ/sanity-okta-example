import * as React from "react";
import "./App.css";

function App() {
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
