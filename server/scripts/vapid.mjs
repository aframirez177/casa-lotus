// Prints a fresh VAPID key pair for Web Push. Put them in .env (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY).
import webpush from "web-push";
const k = webpush.generateVAPIDKeys();
process.stdout.write("VAPID_PUBLIC_KEY=" + k.publicKey + "\nVAPID_PRIVATE_KEY=" + k.privateKey + "\n");
