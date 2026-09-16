'use client';

import {useEffect} from 'react';
import {getCurrentCrmUser} from '@/lib/auth/current-user';
import {routeForUser} from '@/lib/auth/routing';

export default function Page(){
  useEffect(()=>{
    void getCurrentCrmUser()
      .then(user=>window.location.replace(routeForUser(user)))
      .catch(()=>window.location.replace('/login'));
  },[]);
  return <main className="centered-page" aria-busy="true"><p className="ui-help">Opening PlanoraHub…</p></main>;
}
