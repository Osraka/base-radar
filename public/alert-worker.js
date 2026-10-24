self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const slug = event.notification.data?.slug;
  if (typeof slug !== "string" || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(slug)) return;
  event.waitUntil(self.clients.openWindow(`/apps/${slug}`));
});
