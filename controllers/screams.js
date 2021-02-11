const { db, admin } = require("../util/firebase-admin");
const Busboy = require("busboy");
const { DEFAULT_NUMBER_PER_PAGE } = require("../util/constant");

exports.getScreams = (req, res, next) => {
  let {
    lastCreatedAt,
    numPerPage = DEFAULT_NUMBER_PER_PAGE,
    userName,
  } = req.query;
  numPerPage = +numPerPage;

  let hasNextPage = false;
  let getScreamsPromise;

  const calhasNextPage = (size) => size - numPerPage > 0;

  if (lastCreatedAt) {
    getScreamsPromise = !userName
      ? db
          .collection("screams")
          .orderBy("createdAt", "desc")
          .startAfter(lastCreatedAt)
          .get()
          .then((snapshot) => {
            hasNextPage = calhasNextPage(snapshot.size);
            return db
              .collection("screams")
              .orderBy("createdAt", "desc")
              .startAfter(lastCreatedAt)
              .limit(numPerPage)
              .get();
          })
      : db
          .collection("screams")
          .where("userName", "==", userName)
          .orderBy("createdAt", "desc")
          .startAfter(lastCreatedAt)
          .get()
          .then((snapshot) => {
            hasNextPage = calhasNextPage(snapshot.size);
            return db
              .collection("screams")
              .where("userName", "==", userName)
              .orderBy("createdAt", "desc")
              .startAfter(lastCreatedAt)
              .limit(numPerPage)
              .get();
          });
  } else {
    getScreamsPromise = !userName
      ? db
          .collection("screams")
          .orderBy("createdAt", "desc")
          .get()
          .then((snapshot) => {
            hasNextPage = calhasNextPage(snapshot.size);
            return db
              .collection("screams")
              .orderBy("createdAt", "desc")
              .limit(numPerPage)
              .get();
          })
      : db
          .collection("screams")
          .where("userName", "==", userName)
          .orderBy("createdAt", "desc")
          .get()
          .then((snapshot) => {
            hasNextPage = calhasNextPage(snapshot.size);
            return db
              .collection("screams")
              .where("userName", "==", userName)
              .orderBy("createdAt", "desc")
              .limit(numPerPage)
              .get();
          });
  }
  getScreamsPromise
    .then((snapshot) => {
      let screams = [];
      snapshot.forEach((doc) => {
        screams.push({
          screamId: doc.id,
          ...doc.data(),
        });
      });
      res.json({ screams, hasNextPage });
    })
    .catch((err) => {
      console.log(err);
      err.status = 500;
      return next(err);
    });
};

exports.getScream = (req, res, next) => {
  const { screamId } = req.params;
  let screamData = {};
  db.doc(`/screams/${screamId}`)
    .get()
    .then((doc) => {
      if (!doc.exists) {
        const error = new Error(`can not find scream: ${screamId}`);
        error.status = 404;
        return Promise.reject(error);
      }
      screamData = { ...doc.data(), screamId: doc.id };
      return db
        .collection("comments")
        .orderBy("createdAt", "desc")
        .where("screamId", "==", screamId)
        .get();
    })
    .then((snapshot) => {
      screamData.comments = [];
      snapshot.forEach((doc) => {
        screamData.comments.push({ commentId: doc.id, ...doc.data() });
      });
      return res.json(screamData);
    })
    .catch((err) => {
      err.status = err.status || 500;
      return next(err);
    });
};

exports.postAddScream = (req, res, next) => {
  const busboy = new Busboy({ headers: req.headers });
  const bucket = admin.storage().bucket("social-app-655bc.appspot.com");
  let blob;

  const uploadImagePromise = new Promise((resolve, reject) => {
    busboy.on("file", (fieldname, file, filename, encoding, mimetype) => {
      if (mimetype !== "image/jpeg" && mimetype !== "image/png") {
        const error = new Error("Wrong file type submitted");
        error.status = 400;
        return reject(error);
      }
      blob = bucket.file(`scream/${Date.now()}-${filename}`);
      const blobWriter = blob.createWriteStream({
        metadata: {
          contentType: mimetype,
        },
      });
      blobWriter.on("finish", async () => {
        console.log("finish blobwriter");
        const publicUrl = `https://firebasestorage.googleapis.com/v0/b/${
          bucket.name
        }/o/${encodeURI(blob.name).replace("/", "%2F")}?alt=media`;
        resolve(publicUrl);
      });
      file.pipe(blobWriter);
    });
  });

  busboy.on(
    "field",
    function (
      fieldname,
      val,
      fieldnameTruncated,
      valTruncated,
      encoding,
      mimetype
    ) {
      console.log("Field [" + fieldname + "]: value: " + val);
      if (fieldname === "body") {
        req.body.body = val;
      }
    }
  );

  busboy
    .on("finish", () => {
      console.log("finished parsing form");
      console.log(req.body);
      const { body } = req.body;
      if (!body || !body.trim()) {
        const error = new Error("scream body can't be empty");
        error.status = 400;
        return next(error);
      }
      const currentTime = new Date().toISOString();
      const newScream = {
        body,
        userName: req.user.userName,
        userImage: req.user.imageUrl,
        createdAt: currentTime,
        likeCount: 0,
        updatedAt: currentTime,
        commentCount: 0,
      };

      if (!blob) {
        console.log("No image provided");
        return db
          .collection("screams")
          .add(newScream)
          .then((doc) => {
            newScream.screamId = doc.id;
            res.json(newScream);
          })
          .catch((err) => {
            console.log(err);
            err.status = 500;
            return next(err);
          });
      }

      uploadImagePromise
        .then((publicUrl) => {
          newScream.image = publicUrl;
          db.collection("screams")
            .add(newScream)
            .then((doc) => {
              newScream.screamId = doc.id;
              res.json(newScream);
            })
            .catch((err) => {
              console.log(err);
              err.status = 500;
              return next(err);
            });
        })
        .catch((err) => next(err));
    })
    .on("error", (err) => {
      console.log(err);
      const error = new Error("something went wrong with posting scream");
      error.status = 500;
      return next(error);
    });
  busboy.end(req.rawBody);
};

exports.deleteScream = (req, res, next) => {
  const { screamId } = req.params;
  db.doc(`/screams/${screamId}`)
    .get()
    .then((doc) => {
      if (!doc.exists) {
        const error = new Error(`can not find scream: ${screamId}`);
        error.status = 404;
        return Promise.reject(error);
      }
      const scream = doc.data();
      console.log(scream.id);
      if (scream.userName !== req.user.userName) {
        const error = new Error(`not authorized to delete scream ${screamId}`);
        error.status = 403;
        return Promise.reject(error);
      }
      return doc.ref.delete();
    })
    .then(() => {
      res.json({ message: `scream ${screamId} deleted successful` });
    })
    .catch((err) => {
      console.log(err);
      err.status = err.status || 500;
      return next(err);
    });
};

exports.postComment = (req, res, next) => {
  const { screamId } = req.params;
  const { body } = req.body;
  if (!body || !body.trim()) {
    const error = new Error("scream body can't be empty");
    error.status = 400;
    return next(error);
  }
  const newCommentData = {
    body,
    screamId,
    createdAt: new Date().toISOString(),
    userName: req.user.userName,
    userImage: req.user.imageUrl,
    likeCount: 0,
  };

  db.doc(`/screams/${screamId}`)
    .get()
    .then((doc) => {
      if (!doc.exists) {
        const error = new Error(`scream ${screamId} not found`);
        error.status = 404;
        return Promise.reject(error);
      }
      const batch = db.batch();
      const screamRef = doc.ref;
      const commentRef = db.collection("comments").doc();
      newCommentData.commentId = commentRef.id;

      batch.update(screamRef, {
        updatedAt: newCommentData.createdAt,
        commentCount: admin.firestore.FieldValue.increment(1),
      });
      batch.set(commentRef, newCommentData);
      return batch.commit();
    })
    .then(() => {
      res.json(newCommentData);
    })
    .catch((err) => {
      console.log(err);
      err.status = err.status || 500;
      return next(err);
    });
};

exports.postLikeScream = (req, res, next) => {
  const { screamId } = req.params;
  db.collection("likes")
    .where("likeScreamId", "==", screamId)
    .where("createdUserName", "==", req.user.userName)
    .limit(1)
    .get()
    .then((snapshot) => {
      if (!snapshot.empty) {
        const error = new Error("can't relike the scream");
        error.status = 400;
        return Promise.reject(error);
      }
      const screamRef = db.doc(`/screams/${screamId}`);
      const likeRef = db.collection("likes").doc();
      return db.runTransaction(async (t) => {
        const screamDoc = await t.get(screamRef);
        if (!screamDoc.exists) {
          const error = new Error(`screamId ${screamId} is not exist`);
          error.status = 404;
          return Promise.reject(error);
        }
        const screamData = { ...screamDoc.data(), screamId };
        screamData.likeCount++;
        const likeData = {
          likeScreamId: screamId,
          createdUserName: req.user.userName,
          likedUserName: screamData.userName,
        };
        t.set(likeRef, likeData);
        t.update(screamRef, {
          likeCount: admin.firestore.FieldValue.increment(1),
        });
        return { screamData, likeData };
      });
    })
    .then((data) => {
      const { screamData, likeData } = data;
      return res.json({
        message: `like to scream ${screamId} succeessful`,
        screamData,
        likeData,
      });
    })
    .catch((err) => {
      console.log(err);
      err.status = err.status || 500;
      return next(err);
    });
};
exports.postUnLikeScream = (req, res, next) => {
  const { screamId } = req.params;
  db.collection("likes")
    .where("likeScreamId", "==", screamId)
    .where("createdUserName", "==", req.user.userName)
    .limit(1)
    .get()
    .then((snapshot) => {
      if (snapshot.empty) {
        const error = new Error("can't unlike the scream which isn't liked");
        error.status = 400;
        return Promise.reject(error);
      }
      // batch write
      // const batch = db.batch();
      // const likeRef = snapshot.docs[0].ref;
      // const screamRef = db.doc(`/screams/${screamId}`);
      // batch.delete(likeRef);
      // batch.update(screamRef, {
      //   likeCount: admin.firestore.FieldValue.increment(-1),
      // });

      // return batch.commit();

      // transcation
      const likeRef = snapshot.docs[0].ref;
      const screamRef = db.doc(`/screams/${screamId}`);
      return db.runTransaction(async (t) => {
        const screamDoc = await t.get(screamRef);
        if (!screamDoc.exists) {
          const error = new Error(`screamId ${screamId} is not exist`);
          error.status = 404;
          return Promise.reject(error);
        }
        const screamData = { ...screamDoc.data(), screamId };
        screamData.likeCount--;
        t.delete(likeRef);
        t.update(screamRef, {
          likeCount: admin.firestore.FieldValue.increment(-1),
        });
        return screamData;
      });
    })
    .then((screamData) => {
      res.json({ message: `unlike scream ${screamId} successful`, screamData });
    })
    .catch((err) => {
      console.log(err);
      err.status = err.status || 500;
      return next(err);
    });
};

exports.postLikeComment = (req, res, next) => {
  const { commentId } = req.params;
  db.collection("likes")
    .where("likeCommentId", "==", commentId)
    .where("createdUserName", "==", req.user.userName)
    .limit(1)
    .get()
    .then((snapshot) => {
      if (!snapshot.empty) {
        const error = new Error("can't relike the comment");
        error.status = 400;
        return Promise.reject(error);
      }
      const commentRef = db.doc(`/comments/${commentId}`);
      const likeRef = db.collection("likes").doc();
      return db.runTransaction(async (t) => {
        const commentDoc = await t.get(commentRef);
        if (!commentDoc.exists) {
          const error = new Error(`commentId ${commentId} is not exist`);
          error.status = 404;
          return Promise.reject(error);
        }
        const commentData = { ...commentDoc.data(), commentId };
        commentData.likeCount++;
        const likeData = {
          likeCommentId: commentId,
          createdUserName: req.user.userName,
          likedUserName: commentDoc.data().userName,
          screamId: commentDoc.data().screamId,
        };
        t.set(likeRef, likeData);
        t.update(commentRef, {
          likeCount: admin.firestore.FieldValue.increment(1),
        });
        return { commentData, likeData };
      });
    })
    .then((data) => {
      const { commentData, likeData } = data;
      return res.json({
        message: `like to comment ${commentId} succeessful`,
        commentData,
        likeData,
      });
    })
    .catch((err) => {
      console.log(err);
      err.status = err.status || 500;
      return next(err);
    });
};
exports.postUnLikeComment = (req, res, next) => {
  const { commentId } = req.params;
  db.collection("likes")
    .where("likeCommentId", "==", commentId)
    .where("createdUserName", "==", req.user.userName)
    .limit(1)
    .get()
    .then((snapshot) => {
      if (snapshot.empty) {
        const error = new Error("can't unlike the comment which isn't liked");
        error.status = 400;
        return Promise.reject(error);
      }
      // const batch = db.batch();
      // const commentRef = db.doc(`/comments/${commentId}`);
      // batch.delete(snapshot.docs[0].ref);
      // batch.update(commentRef, {
      //   likeCount: admin.firestore.FieldValue.increment(-1),
      // });
      // return batch.commit();

      const commentRef = db.doc(`/comments/${commentId}`);
      const likeRef = snapshot.docs[0].ref;
      return db.runTransaction(async (t) => {
        const commentDoc = await t.get(commentRef);
        if (!commentDoc.exists) {
          const error = new Error(`commentId ${commentId} is not exist`);
          error.status = 404;
          return Promise.reject(error);
        }
        const commentData = { ...commentDoc.data(), commentId };
        commentData.likeCount--;
        t.delete(likeRef);
        t.update(commentRef, {
          likeCount: admin.firestore.FieldValue.increment(-1),
        });
        return commentData;
      });
    })
    .then((commentData) => {
      return res.json({
        message: `unlike comment ${commentId} successful`,
        commentData,
      });
    })
    .catch((err) => {
      console.log(err);
      err.status = err.status || 500;
      return next(err);
    });
};
