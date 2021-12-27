import axios from 'axios'

export const get = (url, data, config = {}) => {
  const requestOptions = {
    ...config,
    params:data
  }
  return axios.get(url, requestOptions).then((res) => {
    return res.response
  }).catch((err) => {
    return err.response
  })
}

export const post = (url, data, config = {}) => {
  return axios.post(url, data, config).then((res) => {
    return res.response
  }).catch((err) => {
    return err.response
  })
}