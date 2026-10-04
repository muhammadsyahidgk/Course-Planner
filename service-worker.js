var CACHE_NAME='course-planner-v2';
var APP_FILES=[
  'index.html',
  'style.css',
  'script.js',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png'
];

self.addEventListener('install',function(event){
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache){
      return cache.addAll(APP_FILES.map(function(file){return new URL(file,self.registration.scope).href}));
    }).then(function(){return self.skipWaiting()})
  );
});

self.addEventListener('activate',function(event){
  event.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.filter(function(key){return key.indexOf('course-planner-')===0&&key!==CACHE_NAME}).map(function(key){return caches.delete(key)}));
    }).then(function(){return self.clients.claim()})
  );
});

self.addEventListener('fetch',function(event){
  var request=event.request;
  if(request.method!=='GET')return;
  var url=new URL(request.url);
  if(url.origin!==self.location.origin)return;

  if(request.mode==='navigate'){
    event.respondWith(
      fetch(request).then(function(response){
        var copy=response.clone();
        caches.open(CACHE_NAME).then(function(cache){cache.put(request,copy)});
        return response;
      }).catch(function(){
        return caches.match(request).then(function(response){
          return response||caches.match(new URL('index.html',self.registration.scope).href);
        });
      })
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(function(cached){
      if(cached)return cached;
      return fetch(request).then(function(response){
        if(response.ok){
          var copy=response.clone();
          caches.open(CACHE_NAME).then(function(cache){cache.put(request,copy)});
        }
        return response;
      });
    })
  );
});
