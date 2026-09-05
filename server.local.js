const app = require('./api/index.js');
const PORT = 5000;
app.listen(PORT, () => {
  console.log('Local API running on http://localhost:' + PORT);
});
