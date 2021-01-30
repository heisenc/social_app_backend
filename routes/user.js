const express = require("express");
const router = express.Router();
const { body } = require("express-validator");
const multer = require("multer");

const isAuth = require("../middleware/is-auth");
const userController = require("../controllers/user");

// multer uploader (unable to apply in cloud functions)
// const fileFilter = (req, file, cb) => {
//   console.log("filtering file");
//   if (
//     file.mimetype === "image/png" ||
//     file.mimetype === "image/jpg" ||
//     file.mimetype === "image/jpeg"
//   ) {
//     cb(null, true);
//   } else {
//     cb(null, false);
//   }
// };
// const uploader = multer({
//   storage: multer.memoryStorage(),
//   fileFilter,
// });

router.post(
  "/login",
  [
    body("email")
      .isEmail()
      .withMessage("Please enter a valid email.")
      .normalizeEmail(),
    body("password").trim().isLength({ min: 5 }),
  ],
  userController.login
);

router.post(
  "/signup",
  [
    body("userName").trim().notEmpty(),
    body("email")
      .isEmail()
      .withMessage("Please enter a valid email.")
      .normalizeEmail(),
    body("password").trim().isLength({ min: 5 }),
    body("confirmPassword")
      .trim()
      .custom((value, { req }) => {
        if (value !== req.body.password) {
          throw new Error("Password have to match");
        }
        return true;
      }),
  ],
  userController.signup
);

router.post(
  "/user/image",
  // uploader.single("image"),
  isAuth,
  userController.uploadPhoto
);

router.post("/user", isAuth, userController.addUserDetail);
router.get("/user", isAuth, userController.getOwnUserDetail);
router.get("/user/:userName", userController.getUserDetail);
router.post("/notifications", isAuth, userController.postReadNotification);

module.exports = router;
