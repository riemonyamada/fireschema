import firebase from 'firebase/app'
import React from 'react'
import { TypedCaller } from '..'

type FunctionsModule = typeof import('./2-1-registerer')

const app: firebase.app.App = firebase.initializeApp({
  // ...
})
const functionsApp = app.functions('asia-northeast1')

export const typedCaller = new TypedCaller<FunctionsModule>(functionsApp)

const Component = () => {
  const createUser = async () => {
    const result = await typedCaller.call('createUser', {
      name: 'test',
      displayName: 'Test',
      age: 20,
      timestamp: new Date().toISOString(),
      options: { a: true },
    })

    if (!result.isOk) {
      console.error(result.error)
      return
    }
    console.log(result.value)
  }

  return <button onClick={createUser}></button>
}
