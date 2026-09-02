const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const userController = require('../controllers/userController');

// All routes below require authentication
router.use(authenticate);

router.get('/', userController.list);
router.get('/:id', userController.show);
router.post('/', userController.create);
router.put('/:id', userController.update);
router.delete('/:id', userController.destroy);

module.exports = router;
