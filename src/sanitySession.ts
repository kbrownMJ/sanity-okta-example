import config from "./lambda/config";
import { Profile } from "passport-saml";
import sanityClient, { ClientConfig, SanityDocumentStub } from "@sanity/client";
import fetch from "node-fetch";
import { OktaSamlProfile } from "./lambda/auth";

const SESSION_LENGTH = 7 * 24 * 60 * 60 * 1000;

const client = sanityClient(config.sanityClient as ClientConfig);

export type SanityUserProfile = {
  userId: string;
  userFullName: string;
  userEmail: string;
  userImage?: string;
  //If the user should be able to log into the Sanity Studio, role must be
  //either administrator or editor. This has no access control significance.
  userRole: "administrator";
  // Timestamp for when the session should expire.
  sessionExpires: Date;
  sessionLabel: string;
};

// This is the ID we set on the user session in Sanity Cloud.
// It should always start with e- to signify an external session.
// This is the identifier you would add to access group documents to
// grant permissions and implement ACL
//
// Valid user ID is [a-zA-Z0-9\-_], so here we replace any character not
// in that set with '-' for a nice readable identifier.
const userId = (email: string) => {
  return `e-okta-${email.replace(/(?:(?![a-zA-Z0-9\-_]).)/g, "-")}`;
};

const removeFromGroups = (user: SanityUserProfile, groupIds: string[]) =>
  Promise.all(
    groupIds.map((id) =>
      client.fetch("* [_id == $id] {members}", { id }).then((result) => {
        const members: string[] = result[0].members;
        const index = members.findIndex((e) => e == user.userId);
        if (index !== -1) {
          return client
            .patch(id)
            .unset([`members[${index}]`])
            .commit();
        }
      })
    )
  );

// A blank access group document
type SanityAccessGroup = SanityDocumentStub & {
  grants: any[];
  members: string[];
};

const baseGroup: SanityAccessGroup = {
  _type: "system.group",
  grants: [],
  members: [],
};

const addToGroups = (user: SanityUserProfile, groupIds: string[]) =>
  Promise.all(
    groupIds.map((id) =>
      client
        .createIfNotExists<SanityAccessGroup>({
          ...baseGroup,
          _id: id,
        })
        .then((group) => {
          if (!(group.members || []).includes(user.userId)) {
            return client
              .patch(group._id)
              .setIfMissing({ members: [] })
              .append("members", [user.userId])
              .commit();
          }
        })
    )
  );

/*
 * Note that the following groups are reserved in Sanity:
 * _.groups.administrator
 * _.groups.create-session
 * _.groups.public
 * _.groups.read
 * _.groups.write
 *
 * So if you have a group in Okta named
 * administrator
 * create-session
 * public
 * read
 * write
 *
 * Then you cannot mutate those yourself. You'll have to use other names.
 */
const RESERVED_GROUPS = [
  "administrator",
  "create-session",
  "public",
  "read",
  "write",
];

const syncGroups = async (user: SanityUserProfile, groupNames: string[]) => {
  // filter out groups we cannot change
  const filteredGroups = groupNames.filter(
    (name) => !RESERVED_GROUPS.includes(name)
  );

  // The groups the user should be a member of
  const groups = filteredGroups.map((name) => `_.groups.${name}`);
  // The groups the user currently is a member of
  const currentGroups: string[] = await client.fetch(
    "* [_type == 'system.group' && identity() in members][]._id"
  );

  // Remove any existing group memberships not included in the passed groups
  const removeFrom = currentGroups.filter((g) => !groups.includes(g));

  // Add the user to any group they don't already belong to, making sure
  // to also create a blank group if it doesnt already exist.
  const addTo = groups.filter((g) => !currentGroups.includes(g));

  return removeFromGroups(user, removeFrom).then(() =>
    addToGroups(user, addTo)
  );
};

const sanityProfileFromSaml = (samlResponse: OktaSamlProfile) => {
  const names = [];
  if (samlResponse.firstName) {
    names.push(samlResponse.firstName);
  }
  if (samlResponse.lastName) {
    names.push(samlResponse.lastName);
  }
  const userFullName = names.join(" ");

  const profile: SanityUserProfile = {
    sessionLabel: "Okta Saml SSO",
    userId: userId(samlResponse.email),
    userFullName,
    userEmail: samlResponse.email,
    //If the user should be able to log into the Sanity Studio, role must be
    //either administrator or editor
    userRole: "administrator",
    // Timestamp for when the session should expire.
    sessionExpires: new Date(new Date().getTime() + SESSION_LENGTH),
  };

  return profile;
};

export const login = (
  samlResponse: OktaSamlProfile
): Promise<SanitySession> => {
  const user = sanityProfileFromSaml(samlResponse);

  const groupsField = samlResponse.groups;
  const groups: string[] = (Array.isArray(groupsField)
    ? groupsField
    : [groupsField]
  ).map((group) => group.toLowerCase());

  return syncGroups(user, groups).then(() => createSession(user));
};

export type SanitySession = {
  token: string;
  endUserClaimUrl: string;
};

const createSession = async (user: SanityUserProfile): Promise<SanitySession> =>
  fetch(
    `https://${config.sanityClient.projectId}.api.sanity.io/v1/auth/thirdParty/session`,
    {
      method: "POST",
      body: JSON.stringify(user),
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.sanityClient.token}`,
      },
    }
  ).then((res) => res.json());
