const functions = require("firebase-functions");
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");

const screamsRoutes = require("./routes/screams");
const userRoutes = require("./routes/user");
const { admin, db } = require("./util/firebase-admin");

const app = express();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cors());

app.use(screamsRoutes);
app.use(userRoutes);

app.use((req, res, next) => {
  const error = new Error("resource not found");
  error.status = 404;
  return next(error);
});

app.use((err, req, res, next) => {
  console.log(err);
  const { status = 500, message, data } = err;
  return res.status(status).json({ message, data });
});

// app.listen(3000);

exports.api = functions.region("asia-east2").https.onRequest(app);
exports.createNotificationOnLike = functions
  .region("asia-east2")
  .firestore.document("likes/{id}")
  .onCreate((snapshot) => {
    const likeScreamId = snapshot.data().likeScreamId;
    let notificationData;
    if (!likeScreamId) {
      const {
        likeCommentId,
        screamId,
        createdUserName: sender,
        likedUserName: recipient,
      } = snapshot.data();
      notificationData = {
        createdAt: new Date().toISOString(),
        recipient,
        sender,
        type: "LIKE_COMMENT",
        read: false,
        screamId,
        commentId: likeCommentId,
      };
    } else {
      const {
        createdUserName: sender,
        likedUserName: recipient,
      } = snapshot.data();

      notificationData = {
        createdAt: new Date().toISOString(),
        recipient,
        sender,
        type: "LIKE_SCREAM",
        read: false,
        screamId: likeScreamId,
      };
    }
    if (notificationData.recipient === notificationData.sender) {
      return Promise.reject("no need to notifiy");
    }
    return db
      .doc(`/notifications/${snapshot.id}`)
      .set(notificationData)
      .catch((err) => {
        console.log(err);
      });
  });

exports.deleteNotificationOnUnlike = functions
  .region("asia-east2")
  .firestore.document("likes/{id}")
  .onDelete((snapshot) => {
    const likeId = snapshot.id;
    return db
      .doc(`/notifications/${likeId}`)
      .delete()
      .catch((err) => {
        console.log(err);
      });
  });

exports.createNotificationOnComment = functions
  .region("asia-east2")
  .firestore.document("comments/{id}")
  .onCreate((snapshot) => {
    return db
      .doc(`/screams/${snapshot.data().screamId}`)
      .get()
      .then((doc) => {
        if (doc.exists) {
          if (doc.data().userName === snapshot.data().userName) {
            return Promise.reject("no need to notifiy");
          }
          return db.doc(`/notifications/${snapshot.id}`).set({
            createdAt: new Date().toISOString(),
            recipient: doc.data().userName,
            sender: snapshot.data().userName,
            type: "COMMENT",
            read: false,
            screamId: doc.id,
          });
        }
        return Promise.reject(new Error("can't find the scream"));
      })
      .catch((err) => {
        console.log(err);
      });
  });

exports.onUserImageChange = functions
  .region("asia-east2")
  .firestore.document("/users/{userName}")
  .onUpdate((change, context) => {
    if (change.after.data().imageUrl === change.before.data().imageUrl) {
      console.log("No need to update imageUrl");
      return null;
    }
    const bucket = admin.storage().bucket();
    const regex = /[^/]+(?=\?alt=media)/; // or /(?:[^/](?!\/))+(?=\?alt=media)/
    const filePath = change.before.data().imageUrl.match(regex)[0];
    console.log(`deleting ${filePath}`);
    bucket
      .file(filePath)
      .delete()
      .then(() => {
        console.log(`delete old image ${filePath} success`);
      })
      .catch(console.log);
    db.collection("screams")
      .where("userName", "==", context.params.userName)
      .get()
      .then((snapshot) => {
        snapshot.forEach((doc) => {
          doc.ref
            .update({ userImage: change.after.data().imageUrl })
            .catch((err) => {
              console.log(err);
            });
        });
      })
      .catch(console.log);
    db.collection("comments")
      .where("userName", "==", context.params.userName)
      .get()
      .then((snapshot) => {
        snapshot.forEach((doc) => {
          doc.ref
            .update({ userImage: change.after.data().imageUrl })
            .catch((err) => {
              console.log(err);
            });
        });
      })
      .catch(console.log);
  });

exports.onScreamDelete = functions
  .region("asia-east2")
  .firestore.document("/screams/{screamId}")
  .onDelete((snapshot, context) => {
    const { screamId } = context.params;
    db.collection("likes")
      .where("likeScreamId", "==", screamId)
      .get()
      .then((snapshot) =>
        snapshot.forEach((doc) => {
          doc.ref.delete().catch((err) => {
            console.log(err);
          });
        })
      )
      .catch(console.log);

    db.collection("comments")
      .where("screamId", "==", screamId)
      .get()
      .then((snapshot) => {
        snapshot.forEach((doc) => {
          doc.ref.delete().catch((err) => {
            console.log(err);
          });
        });
      })
      .catch(console.log);

    db.collection("likes")
      .where("screamId", "==", screamId)
      .get()
      .then((snapshot) =>
        snapshot.forEach((doc) => {
          doc.ref.delete().catch((err) => {
            console.log(err);
          });
        })
      )
      .catch(console.log);

    db.collection("notifications")
      .where("screamId", "==", screamId)
      .get()
      .then((snapshot) => {
        snapshot.forEach((doc) => {
          doc.ref.delete().catch((err) => {
            console.log(err);
          });
        });
      })
      .catch(console.log);
  });
