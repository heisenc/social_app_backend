const { db, admin } = require("../util/firebase-admin");
const { validationResult } = require("express-validator");
const firebase = require("firebase");
const { Readable } = require("stream");

const Busboy = require("busboy");
const { throws } = require("assert");
const config = {
  apiKey: "AIzaSyASt4KRKlOeJrZJbo8bl8TpYQ_zX7NDb1Y",
  authDomain: "social-app-655bc.firebaseapp.com",
  projectId: "social-app-655bc",
  storageBucket: "social-app-655bc.appspot.com",
  messagingSenderId: "544107771512",
  appId: "1:544107771512:web:e5fffae1ec4058d941df8d",
  measurementId: "G-ZHDL52PJH6",
};

firebase.initializeApp(config);

exports.signup = async (req, res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    const error = new Error("Validation failed, entered data is incorrect");
    error.status = 422;
    error.data = errors.array();
    return next(error);
  }

  const { email, password, confirmPassword, userName } = req.body;
  try {
    const doc = await db.doc(`/users/${userName}`).get();
    if (doc.exists) {
      const error = new Error("this user name is already taken");
      error.status = 400;
      return next(error);
    }
    const noImg = "no-img.png";
    const data = await firebase
      .auth()
      .createUserWithEmailAndPassword(email, password);
    const userId = data.user.uid;
    const token = await data.user.getIdToken();

    await db.doc(`/users/${userName}`).set({
      userName,
      email,
      createdAt: new Date().toISOString(),
      imageUrl: `https://firebasestorage.googleapis.com/v0/b/${config.storageBucket}/o/${noImg}?alt=media`,
      userId,
    });
    return res.status(201).json({ token });
  } catch (error) {
    if (error.code === "auth/email-already-in-use") {
      const err = new Error("Email is already in use");
      err.status = 400;
      return next(err);
    }
    error.status = 500;
    return next(error);
  }
};

exports.login = async (req, res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    const error = new Error("Validation failed, entered data is incorrect");
    error.status = 422;
    error.data = errors.array();
    return next(error);
  }

  const { email, password } = req.body;
  let data;
  try {
    data = await firebase.auth().signInWithEmailAndPassword(email, password);
  } catch (error) {
    const err = new Error("Wrong credentials, please try again");
    err.status = 403;
    return next(err);
  }

  try {
    const token = await data.user.getIdToken();
    return res.json({ token });
  } catch (error) {
    error.status = 500;
    return next(error);
  }
};

exports.uploadPhoto = (req, res, next) => {
  const busboy = new Busboy({ headers: req.headers });
  const bucket = admin.storage().bucket("social-app-655bc.appspot.com");
  let blob, originalFileName;
  busboy
    .on("file", (fieldname, file, filename, encoding, mimetype) => {
      if (mimetype !== "image/jpeg" && mimetype !== "image/png") {
        const error = new Error("Wrong file type submitted");
        error.status = 400;
        return next(error);
      }
      originalFileName = filename;
      blob = bucket.file(`${Date.now()}-${originalFileName}`);
      const blobWriter = blob.createWriteStream({
        metadata: {
          contentType: mimetype,
        },
      });
      blobWriter.on("finish", async () => {
        console.log("finish blobwriter");
        const publicUrl = `https://firebasestorage.googleapis.com/v0/b/${
          bucket.name
        }/o/${encodeURI(blob.name)}?alt=media`;
        try {
          await db
            .doc(`/users/${req.user.userName}`)
            .update({ imageUrl: publicUrl });
          res.json({ filename: originalFileName, fileLocation: publicUrl });
        } catch (err) {
          err.status = 500;
          return next(err);
        }
      });
      file.pipe(blobWriter);
    })
    .on("finish", () => {
      if (!blob) {
        const error = new Error("No image provided");
        error.status = 400;
        return next(error);
      }
      console.log("finished uploading photo");
    })
    .on("error", (err) => {
      console.log(err);
      const error = new Error("something went wrong with uploading image file");
      error.status = 500;
      return next(error);
    });

  busboy.end(req.rawBody);
};

exports.addUserDetail = async (req, res, next) => {
  console.log(req.user.userName);
  const userDetailFields = ["bio", "website", "location"];
  const userDetails = {};
  for (const field of userDetailFields) {
    let value = req.body[field];

    if (value === undefined) {
      continue;
    }

    value = value.trim();

    if (field === "website") {
      value = value.match(
        /[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/
      )
        ? value.match(/^https?:\/\//)
          ? value
          : `http://${value}`
        : null;
      // if (!value) {
      //   continue;
      // }
    }
    userDetails[field] = value;
  }

  if (
    Object.keys(userDetails).length === 0 &&
    userDetails.constructor === Object
  ) {
    const error = new Error("No user details provided");
    error.status = 400;
    return next(error);
  }

  try {
    await db.doc(`/users/${req.user.userName}`).update(userDetails);
    return res.json({
      message: "Details added successfull",
      updatedDetails: userDetails,
    });
  } catch (err) {
    err.status = 500;
    return next(err);
  }
};

exports.getOwnUserDetail = async (req, res, next) => {
  const userData = {};
  try {
    const userdoc = await db.doc(`/users/${req.user.userName}`).get();
    if (userdoc.exists) {
      userData.credentials = userdoc.data();
      const likeSnapshot = await db
        .collection("likes")
        .where("createdUserName", "==", req.user.userName)
        .get();
      userData.likes = [];
      likeSnapshot.forEach((doc) => {
        userData.likes.push(doc.data());
      });
      const notiSnapshot = await db
        .collection("notifications")
        .where("recipient", "==", req.user.userName)
        .orderBy("createdAt", "desc")
        .limit(10)
        .get();
      userData.notifications = [];
      notiSnapshot.forEach((doc) => {
        userData.notifications.push({ ...doc.data(), notificationId: doc.id });
      });
      return res.json(userData);
    } else {
      const error = new Error(`can not find userName : ${req.user.userName}`);
      error.status = 400;
      return next(error);
    }
  } catch (error) {
    error.status = 500;
    return next(error);
  }
};

exports.getUserDetail = async (req, res, next) => {
  const userData = {};
  const { userName } = req.params;
  try {
    const userDoc = await db.doc(`/users/${userName}`).get();
    if (!userDoc.exists) {
      const error = new Error(`${userName} user doesn't exist`);
      error.status = 404;
      return next(error);
    }
    userData.user = userDoc.data();
    const screamSnapshot = await db
      .collection("screams")
      .where("userName", "==", userName)
      .orderBy("createdAt", "desc")
      .get();
    userData.screams = [];
    screamSnapshot.forEach((doc) => {
      userData.screams.push({ ...doc.data(), screamId: doc.id });
    });
    return res.json(userData);
  } catch (err) {
    err.status = 500;
    return next(err);
  }
};

exports.postReadNotification = async (req, res, next) => {
  const { notifications } = req.body;
  if (!notifications) {
    const error = new Error("No notifications field provided");
    error.status = 400;
    return next(error);
  }
  if (!Array.isArray(notifications) || !notifications.length) {
    const error = new Error(
      "should pass notifications array of notification ID"
    );
    error.status = 400;
    return next(error);
  }

  try {
    const p = await Promise.all(
      notifications.map(async (notiId) => {
        const notiDoc = await db.doc(`/notifications/${notiId}`).get();
        const { recipient } = notiDoc.data();
        if (recipient !== req.user.userName) {
          const error = new Error(
            `not authorized to read notification ${notiDoc.id}`
          );
          error.status = 403;
          return Promise.reject(error);
        }
        return notiDoc.ref.update({
          read: true,
        });
      })
    );
    return res.json({ message: "Notifications marked read" });
  } catch (err) {
    err.status = err.status || 500;
    return next(err);
  }
};

// using multer to parse file (unable to apply in cloud functions)
// exports.uploadPhoto = (req, res, next) => {
//   const image = req.file;
//   if (!image) {
//     const error = new Error("No image provided");
//     error.status = 400;
//     return next(error);
//   }

//   const bucket = admin.storage().bucket("social-app-655bc.appspot.com");
//   console.log(image.buffer);
//   const readableStream = Readable.from(image.buffer);
//   const blob = bucket.file(`${Date.now()}-${image.originalname}`);
//   const blobWriter = blob.createWriteStream({
//     metadata: {
//       contentType: image.mimetype,
//     },
//   });

//   const chunkSize = 1024 * 1024;

// slice buffer into small chunk and write to writable stream
//   readableStream.on("readable", () => {
//     let buffer;
//     console.log("Stream is readable (new data received in buffer)");
//     buffer = readableStream.read(1024 * 1024);
//     console.log(buffer);
//     console.log(readableStream.read(1024 * 1024));
//     while (buffer.length > chunkSize) {
//       const smallChunk = buffer.slice(0, chunkSize);
//       blobWriter.write(smallChunk);
//       console.log(`write ${smallChunk.length} bytes of data...`);
//       buffer = buffer.slice(chunkSize);
//     }
//     console.log(`write ${buffer.length} bytes of data...`);
//     blobWriter.write(buffer);
//   });

//   // replaced by readable event
//   // readableStream.on("data", (chunk) => {
//   //   console.log(`consuming chunk with size(${chunk.length})`);
//   //   blobWriter.write(chunk);
//   // });

//   readableStream.on("end", () => {
//     console.log("readable end");
//     blobWriter.end();
//   });

//   blobWriter.on("error", (err) => {
//     console.log(err);
//     const error = new Error("something went wrong with uploading image file");
//     error.status = 500;
//     return next(error);
//   });

//   blobWriter.on("finish", () => {
//     console.log("writeable stream finished");
//     const publicUrl = `https://firebasestorage.googleapis.com/v0/b/${
//       bucket.name
//     }/o/${encodeURI(blob.name)}?alt=media`;
//     res.json({ filename: image.originalname, fileLocation: publicUrl });
//   });
// };
