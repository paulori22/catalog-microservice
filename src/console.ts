import './bootstrap';
//Comment just to not break the importation order when saving
import {default as chalk} from 'chalk';
import * as commands from './commands';

const command = process.argv[2] || null;

if (!command) {
  showAvailableCommands();
}

const commandKey = Object.keys(commands).find(
  c => commands[c].command === command,
);

if (!commandKey) {
  showAvailableCommands();
}
chalk.green(commandKey);

const commandInstance = new commands[commandKey]();

commandInstance.run().catch(console.error);

function showAvailableCommands() {
  console.log(chalk.green('Loopback Console'));
  console.log('');
  console.log(chalk.green('Available commands'));
  console.log('');
  for (const c of Object.keys(commands)) {
    console.log(
      `- ${chalk.green(commands[c].command)} - ${commands[c].description}`,
    );
  }
  console.log('');
  process.exit();
}
