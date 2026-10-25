const notice = document.getElementById("accountDeletionNotice");
if (notice && new URLSearchParams(window.location.search).get("account") === "deleted") {
  notice.hidden = false;
}
