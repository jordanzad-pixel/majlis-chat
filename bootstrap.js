if(process.env.DATABASE_URL){await import('./server-pg.js')}else{await import('./server.js')}
