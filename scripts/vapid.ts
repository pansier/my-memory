import webpush from "web-push";
const keys = webpush.generateVAPIDKeys();
console.log(
  "VAPID_PUBLIC_KEY=" +
    keys.publicKey +
    "\nVAPID_PRIVATE_KEY=" +
    keys.privateKey,
);
console.error("Bewaar deze sleutels in .env, nooit in Git.");
