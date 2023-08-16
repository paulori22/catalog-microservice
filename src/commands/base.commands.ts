export abstract class BaseCommand {
  static command: string;
  static description: string;
  abstract run(): Promise<any>;
}
