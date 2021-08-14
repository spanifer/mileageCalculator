const router = require('express').Router();
const fs = require('fs');

/* GET home page. */
router.get('/', function(req, res, next) {

  res.render('index', { 
    title: 'Mileage Calculator',
  });
});

module.exports = router;
