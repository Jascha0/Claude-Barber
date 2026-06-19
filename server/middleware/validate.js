const { body, param, validationResult } = require("express-validator");

function rejectIfInvalid(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: errors.array()[0].msg });
  }
  next();
}

const rules = {
  booking: [
    body("customerName")
      .trim().notEmpty().withMessage("Name ist erforderlich")
      .isLength({ max: 100 }).withMessage("Name zu lang"),
    body("customerPhone")
      .trim().notEmpty().withMessage("Telefonnummer ist erforderlich")
      .matches(/^\+?[\d\s\-().]{6,20}$/).withMessage("Ungültige Telefonnummer"),
    body("date")
      .matches(/^\d{4}-\d{2}-\d{2}$/).withMessage("Ungültiges Datum"),
    body("timeSlot")
      .matches(/^\d{2}:\d{2}$/).withMessage("Ungültige Uhrzeit"),
    body("serviceId")
      .isInt({ min: 1 }).withMessage("Ungültige Service-ID"),
    body("staffId")
      .isInt({ min: 0 }).withMessage("Ungültige Mitarbeiter-ID"),
  ],

  login: [
    body("password")
      .notEmpty().withMessage("Passwort erforderlich")
      .isLength({ max: 200 }).withMessage("Eingabe zu lang"),
  ],

  addService: [
    body("name")
      .trim().notEmpty().withMessage("Name ist erforderlich")
      .isLength({ max: 100 }).withMessage("Name zu lang"),
    body("price")
      .isFloat({ min: 0.01, max: 10000 }).withMessage("Ungültiger Preis"),
    body("duration")
      .isInt({ min: 5, max: 480 }).withMessage("Dauer muss zwischen 5 und 480 Minuten liegen"),
  ],

  addStaff: [
    body("name")
      .trim().notEmpty().withMessage("Name ist erforderlich")
      .isLength({ max: 100 }).withMessage("Name zu lang"),
  ],

  updateSalon: [
    body("name").optional().trim().isLength({ max: 100 }).withMessage("Name zu lang"),
    body("address").optional().trim().isLength({ max: 200 }).withMessage("Adresse zu lang"),
    body("phone").optional().trim()
      .matches(/^(\+?[\d\s\-().]{0,20})?$/).withMessage("Ungültige Telefonnummer"),
    body("city").optional().trim().isLength({ max: 100 }).withMessage("Stadt zu lang"),
    body("hero_img_url").optional({ checkFalsy: true })
      .isURL({ protocols: ["https"] }).withMessage("Bild-URL muss HTTPS sein"),
    body("maps_url").optional({ checkFalsy: true })
      .isURL({ protocols: ["https"] }).withMessage("Maps-URL muss HTTPS sein"),
  ],

  changePassword: [
    body("newPassword")
      .isLength({ min: 6, max: 200 }).withMessage("Passwort muss mindestens 6 Zeichen haben"),
  ],

  idParam: [
    param("id").isInt({ min: 1 }).withMessage("Ungültige ID"),
  ],
};

module.exports = { rules, rejectIfInvalid };
