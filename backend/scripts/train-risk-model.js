// Manual training from the CLI; the server also trains automatically at startup and when datasets change.
const { createTrainer } = require('../ai/trainer');

const trainer = createTrainer();
trainer.trainNow({ force: true }).then(() => {
  console.log(JSON.stringify(trainer.status(), null, 2));
  process.exit(trainer.status().ready ? 0 : 1);
});
