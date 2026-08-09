/**
 * Leave the server workspace overlay by using the sidebar Servers nav.
 * The dedicated "Back to servers" header control was removed (#94 / chrome cleanup).
 */
async function leaveWorkspaceToServers(page, timeout = 15000) {
  await page.getByRole("button", { name: "Servers", exact: true }).first().click();
  await page.locator("[data-overview-page]").waitFor({
    state: "visible",
    timeout,
  });
}

module.exports = { leaveWorkspaceToServers };
