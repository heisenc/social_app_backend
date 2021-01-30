const { db, admin } = require("../util/firebase-admin");

exports.getScreams = (req, res, next) => {
  let { page = 1, numPerPage = 10 } = req.query;
  page = +page;
  numPerPage = +numPerPage;
  let totalScreamsCount;
  db.collection("screams")
    .orderBy("createdAt", "desc")
    .get()
    .then((snapshot) => {
      totalScreamsCount = snapshot.size;
      return db
        .collection("screams")
        .orderBy("createdAt", "desc")
        .offset((page - 1) * numPerPage)
        .limit(numPerPage)
        .get();
    })
    .then((snapshot) => {
      let screams = [];
      snapshot.forEach((doc) => {
        screams.push({
          screamId: doc.id,
          ...doc.data(),
        });
      });
      res.json({ screams, totalScreamsCount });
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
  const { body } = req.body;
  if (!body || !body.trim()) {
    const error = new Error("scream body can't be empty");
    error.status = 400;
    return next(error);
  }
  const newScream = {
    body,
    userName: req.user.userName,
    userImage: req.user.imageUrl,
    createdAt: new Date().toISOString(),
    likeCount: 0,
    commentCount: 0,
  };

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
