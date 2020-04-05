/********************************************************************************
 * Copyright (c) 2018 - 2019 Contributors to the Eclipse Foundation
 *
 * See the NOTICE file(s) distributed with this work for additional
 * information regarding copyright ownership.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0, or the W3C Software Notice and
 * Document License (2015-05-13) which is available at
 * https://www.w3.org/Consortium/Legal/2015/copyright-software-and-document.
 *
 * SPDX-License-Identifier: EPL-2.0 OR W3C-20150513
 ********************************************************************************/

/**
 * Firestore client
 */

//import * as WoT from 'wot-typescript-definitions'

import { ProtocolClient, Content } from '@node-wot/core'
import { WoTFirestoreForm, WoTFirestoreConfig } from './wotfirestore'

import 'firebase/auth'
import 'firebase/firestore'
import {
  initFirestore,
  writeDataToFirestore,
  readDataFromFirestore,
  subscribeFromFirestore,
  unsubscribeFromFirestore
} from './wotfirestore-handler'
import * as TD from '@node-wot/td-tools'

export default class WoTFirestoreClient implements ProtocolClient {
  private firestore = null
  private firestoreObservers = {}
  private fbConfig = null

  constructor(config: WoTFirestoreConfig = null) {
    if (typeof config !== 'object') {
      throw new Error(
        `WoTFirestore requires config object (got ${typeof config})`
      )
    }
    this.fbConfig = config
  }

  public toString(): string {
    return `[WoTFirestoreClient]`
  }

  private makePointerInfo(
    form: WoTFirestoreForm
  ): {
    hostName: string
    name: string
    topic: string
    type: string
    resource: string
  } {
    console.debug('***** makePointInfo form:', form)
    const splittedHref = form.href.split('://')
    const paths = splittedHref[1].split('/')
    const hostName = paths[0]
    const name = paths[1]
    let type = paths[2]
    if (type === undefined) {
      type = 'td'
    }
    const resource = paths[3]
    const topic = splittedHref[1]
    const ret = {
      hostName: hostName,
      name: name,
      topic: topic,
      type: type,
      resource: resource
    }
    console.debug('***** makePointInfo ret:', ret)
    return ret
  }

  public readResource(form: WoTFirestoreForm): Promise<Content> {
    console.log('************************** readResource form:', form)
    return new Promise<Content>((resolve, reject) => {
      initFirestore(this.fbConfig, this.firestore)
        .then(firestore => {
          this.firestore = firestore
          const pointerInfo = this.makePointerInfo(form)
          readDataFromFirestore(this.firestore, pointerInfo.topic)
            .then(content => {
              resolve(content)
            })
            .catch(err => {
              reject(err)
            })
        })
        .catch(err => {
          console.error(err)
          reject(err)
        })
    })
  }

  public writeResource(form: WoTFirestoreForm, content: Content): Promise<any> {
    console.log('************************** writeResource form:', form)
    console.log('************************** writeResource content:', content)
    const pointerInfo = this.makePointerInfo(form)
    return new Promise<any>((resolve, reject) => {
      initFirestore(this.fbConfig, this.firestore)
        .then(firestore => {
          this.firestore = firestore
          console.log('************** write pointer info', pointerInfo)
          let splittedTopic = pointerInfo.topic.split('/')
          if (splittedTopic && splittedTopic[2] === 'properties') {
            splittedTopic[2] = 'propertyReceives'
            pointerInfo.topic = splittedTopic.join('/')
            console.log('************** converted pointer info', pointerInfo)
          }
          writeDataToFirestore(this.firestore, pointerInfo.topic, content)
            .then(value => {
              resolve(content)
            })
            .catch(err => {
              reject(err)
            })
        })
        .catch(err => {
          console.error(err)
          reject(err)
        })
    })
  }

  public invokeResource(
    form: WoTFirestoreForm,
    content?: Content
  ): Promise<Content> {
    console.log('************************** invokeResource form:', form)
    console.log('************************** invokeResource content:', content)
    return new Promise<Content>((resolve, reject) => {
      initFirestore(this.fbConfig, this.firestore)
        .then(firestore => {
          this.firestore = firestore
          // Firestoreの該当箇所にActionの内容を記述する
          const pointerInfo = this.makePointerInfo(form)
          // subscrbe for results
          const actionResultTopic =
            pointerInfo.hostName +
            '/' +
            encodeURIComponent(pointerInfo.name) +
            '/actionResults/' +
            encodeURIComponent(pointerInfo.resource)

          subscribeFromFirestore(
            this.firestore,
            this.firestoreObservers,
            actionResultTopic,
            (err, content) => {
              console.log('return action and unsubscribe')
              unsubscribeFromFirestore(
                this.firestoreObservers,
                actionResultTopic
              )
              console.log('@@@@@ finish unsubscribe')
              if (err) {
                reject(err)
                return
              }
              resolve(content)
            }
          )
          // if not input was provided, set up an own body otherwise take input as body
          if (content !== undefined) {
            writeDataToFirestore(this.firestore, pointerInfo.topic, content)
              .then(() => {
                // nothing todo
              })
              .catch(err => {
                console.error('error:', err)
                reject(err)
              })
          } else {
            writeDataToFirestore(this.firestore, pointerInfo.topic, {
              body: undefined,
              type: ''
            })
              .then(() => {
                // nothing todo
              })
              .catch(err => {
                console.error('error:', err)
                reject(err)
              })
          }
        })
        .catch(err => {
          console.error(err)
          reject(err)
        })
      // there will bo no response
    })
  }

  public unlinkResource(form: WoTFirestoreForm): Promise<any> {
    console.log('************************** unlinkResource form:', form)
    return new Promise<any>((resolve, reject) => {
      initFirestore(this.fbConfig, this.firestore)
        .then(firestore => {
          this.firestore = firestore
          const pointerInfo = this.makePointerInfo(form)
          unsubscribeFromFirestore(this.firestoreObservers, pointerInfo.topic)
          resolve()
        })
        .catch(err => {
          console.error(err)
          reject(err)
        })
    })
  }

  public subscribeResource(
    form: WoTFirestoreForm,
    next: (value: any) => void,
    error?: (error: any) => void,
    complete?: () => void
  ): any {
    const pointerInfo = this.makePointerInfo(form)
    // subscrbe for results
    initFirestore(this.fbConfig, this.firestore)
      .then(firestore => {
        this.firestore = firestore
        subscribeFromFirestore(
          this.firestore,
          this.firestoreObservers,
          pointerInfo.topic,
          (err, content) => {
            if (err) {
              error(err)
            } else {
              next(content)
            }
          }
        )
      })
      .catch(err => {
        console.error(err)
        error(err)
      })
  }

  public start(): boolean {
    return true
  }

  public stop(): boolean {
    //    if (this.agent && this.agent.destroy) this.agent.destroy() // When running in browser mode, Agent.destroy() might not exist.
    return true
  }

  public setSecurity(
    metadata: Array<TD.SecurityScheme>,
    credentials?: any
  ): boolean {
    /*    if (
      metadata === undefined ||
      !Array.isArray(metadata) ||
      metadata.length == 0
    ) {
      console.warn(`HttpClient without security`)
      return false
    }

    // TODO support for multiple security schemes
    let security: WoT.Security = metadata[0]

    if (security.scheme === 'basic') {
      if (
        credentials === undefined ||
        credentials.username === undefined ||
        credentials.password === undefined
      ) {
        throw new Error(`No Basic credentionals for Thing`)
      }
      this.authorization =
        'Basic ' +
        Buffer.from(credentials.username + ':' + credentials.password).toString(
          'base64'
        )
    } else if (security.scheme === 'bearer') {
      if (credentials === undefined || credentials.token === undefined) {
        throw new Error(`No Bearer credentionals for Thing`)
      }
      // TODO check security.in and adjust
      this.authorization = 'Bearer ' + credentials.token
    } else if (security.scheme === 'apikey') {
      if (credentials === undefined || credentials.apikey === undefined) {
        throw new Error(`No API key credentionals for Thing`)
      }
      this.authorization = credentials.apikey
      if (security.in === 'header' && security.name !== undefined) {
        this.authorizationHeader = security.name
      }
    } else if (security.scheme === 'nosec') {
      // nothing to do
    } else {
      console.error(
        `HttpClient cannot set security scheme '${security.scheme}'`
      )
      console.dir(metadata)
      return false
    }

    if (security.proxy) {
      if (this.proxyOptions !== null) {
        console.info(
          `HttpClient overriding client-side proxy with security proxy '${security.proxy}`
        )
      }

      this.proxyOptions = this.uriToOptions(security.proxy, true)

      // TODO support for different credentials at proxy and server (e.g., credentials.username vs credentials.proxy.username)
      if (security.scheme == 'basic') {
        if (
          credentials === undefined ||
          credentials.username === undefined ||
          credentials.password === undefined
        ) {
          throw new Error(`No Basic credentionals for Thing`)
        }
        this.proxyOptions.headers = {}
        this.proxyOptions.headers['Proxy-Authorization'] =
          'Basic ' +
          Buffer.from(
            credentials.username + ':' + credentials.password
          ).toString('base64')
      } else if (security.scheme == 'bearer') {
        if (credentials === undefined || credentials.token === undefined) {
          throw new Error(`No Bearer credentionals for Thing`)
        }
        this.proxyOptions.headers = {}
        this.proxyOptions.headers['Proxy-Authorization'] =
          'Bearer ' + credentials.token
      }
    }

    console.log(`HttpClient using security scheme '${security.scheme}'`)*/
    return true
  }
}
