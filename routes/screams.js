const express = require("express");
const router = express.Router();

const screamsControllers = require("../controllers/screams");
const isAuth = require("../middleware/is-auth");

router.get("/screams", screamsControllers.getScreams);
router.post("/scream", isAuth, screamsControllers.postAddScream);
router.get("/scream/:screamId", screamsControllers.getScream);
router.delete("/scream/:screamId", isAuth, screamsControllers.deleteScream);
router.post(
  "/scream/:screamId/comment",
  isAuth,
  screamsControllers.postComment
);
router.post("/scream/:screamId/like", isAuth, screamsControllers.postLikeScream);
router.post("/scream/:screamId/unlike", isAuth, screamsControllers.postUnLikeScream);
router.post('/comment/:commentId/like', isAuth, screamsControllers.postLikeComment);
router.post('/comment/:commentId/unlike', isAuth, screamsControllers.postUnLikeComment);
module.exports = router;
