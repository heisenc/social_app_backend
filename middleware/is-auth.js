const { admin, db } = require("../util/firebase-admin");

module.exports = (req, res, next) => {
  const authHeader = req.get("Authorization");
  if (!authHeader) {
    return res.status(401).json({ message: "Not authenticated." });
  }
  const token = authHeader.split("Bearer ")[1];
  console.log(token);
  admin
    .auth()
    .verifyIdToken(token)
    .then((decodedToken) => {
      req.user = decodedToken;
      console.log(`decoded token: ${req.user}`);
      return db
        .collection("users")
        .where("userId", "==", req.user.uid)
        .limit(1)
        .get();
    })
    .then((snapshot) => {
      req.user.userName = snapshot.docs[0].data().userName;
      req.user.imageUrl = snapshot.docs[0].data().imageUrl;
      return next();
    })
    .catch((err) => {
      res.status(401).json(err);
    });
};
