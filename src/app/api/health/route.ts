import pkg from '../../../../package.json';
export function GET(){return Response.json({ok:true,service:'lihvodruida-site',version:pkg.version},{headers:{'Cache-Control':'no-store','X-Lihvo-Site-Api':'v1'}});}
