export type XValue = string | number | boolean;

export interface XPlusConfig {
  name: string;
  description: string;
  router: {
    directory: string;
  };
  components: {
    directory: string;
  };
  plugins: string[];
  pluginOptions?: any;
  middleware: string[];
  i18n: {
    defaultLocale: string;
    locales: string[];
    directory: string;
  };
}
