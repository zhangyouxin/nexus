import { Router, Model, Types } from 'chomex';

// Define your model
class User extends Model {
  static schema = {
    name: Types.string.isRequired,
    age: Types.number,
  };
}
const router = new Router();
// Define your routes
router.on('/users/create', (message) => {
  const obj = message.user;
  const user = User.new(obj).save();
  return user;
});

export { router };

chrome.runtime.onMessage.addListener(router.listener());
